/**
 * Blockchain WebSocket Service
 * Provides real-time blockchain data updates via WebSocket connections
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { log, LogContext } from '../../utils/logger';
import { InternalServerError } from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from '../database/service-base';
import { pubSubService } from '../redis/pubsub';
import { AuthenticatedRequest } from '../../middleware/auth';

export interface WebSocketClient {
    id: string;
    ws: WebSocket;
    subscriptions: Set<string>;
    userId?: string;
    apiKeyId?: string;
    authenticated: boolean;
    lastPing: Date;
    metadata: Record<string, any>;
}

export interface WebSocketMessage {
    type: string;
    channel?: string;
    data?: any;
    timestamp: Date;
    requestId?: string;
}

export interface SubscriptionFilter {
    addresses?: string[];
    eventTypes?: string[];
    tokenAddresses?: string[];
    blockRange?: { from?: string; to?: string };
}

export class BlockchainWebSocketService extends HealthCheckableService {
    private wss: WebSocketServer | null = null;
    private httpServer: HttpServer | null = null;
    private clients: Map<string, WebSocketClient> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;

    private readonly config = {
        port: parseInt(process.env.WEBSOCKET_PORT || '3001'),
        heartbeatInterval: parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL || '30000'),
        maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS || '1000'),
        authRequired: process.env.WEBSOCKET_AUTH_REQUIRED === 'true'
    };

    constructor() {
        super('BlockchainWebSocketService');
    }

    /**
     * Start the WebSocket server
     */
    async start(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        if (this.isRunning) {
            logger.warn('WebSocket server is already running');
            return;
        }

        try {
            logger.info('Starting blockchain WebSocket server', { 
                port: this.config.port,
                authRequired: this.config.authRequired
            });

            // Create HTTP server for WebSocket upgrade
            this.httpServer = createServer();
            
            // Create WebSocket server
            this.wss = new WebSocketServer({
                server: this.httpServer,
                path: '/blockchain-ws'
            });

            // Set up WebSocket event handlers
            this.setupWebSocketHandlers(context);

            // Set up Redis pub/sub listeners
            await this.setupPubSubListeners(context);

            // Start heartbeat mechanism
            this.startHeartbeat(context);

            // Start HTTP server
            await new Promise<void>((resolve, reject) => {
                this.httpServer!.listen(this.config.port, (error?: Error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            this.isRunning = true;
            logger.info('Blockchain WebSocket server started successfully', { port: this.config.port });

        } catch (error) {
            logger.error('Failed to start WebSocket server', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Stop the WebSocket server
     */
    async stop(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        if (!this.isRunning) {
            logger.warn('WebSocket server is not running');
            return;
        }

        try {
            logger.info('Stopping blockchain WebSocket server');

            this.isRunning = false;

            // Clear heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }

            // Close all client connections
            for (const client of this.clients.values()) {
                client.ws.close(1000, 'Server shutting down');
            }
            this.clients.clear();

            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
                this.wss = null;
            }

            // Close HTTP server
            if (this.httpServer) {
                await new Promise<void>((resolve) => {
                    this.httpServer!.close(() => resolve());
                });
                this.httpServer = null;
            }

            logger.info('Blockchain WebSocket server stopped');

        } catch (error) {
            logger.error('Failed to stop WebSocket server', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocketHandlers(context?: LogContext): void {
        const logger = log.child(context || {});

        if (!this.wss) return;

        this.wss.on('connection', (ws: WebSocket, request) => {
            const clientId = this.generateClientId();
            
            logger.info('WebSocket client connected', { 
                clientId,
                userAgent: request.headers['user-agent'],
                origin: request.headers.origin
            });

            // Create client object
            const client: WebSocketClient = {
                id: clientId,
                ws,
                subscriptions: new Set(),
                authenticated: !this.config.authRequired, // Auto-authenticate if auth not required
                lastPing: new Date(),
                metadata: {
                    userAgent: request.headers['user-agent'],
                    origin: request.headers.origin,
                    connectedAt: new Date()
                }
            };

            this.clients.set(clientId, client);

            // Set up message handler
            ws.on('message', (data: Buffer) => {
                this.handleClientMessage(client, data, context);
            });

            // Handle client disconnect
            ws.on('close', (code: number, reason: Buffer) => {
                logger.info('WebSocket client disconnected', { 
                    clientId,
                    code,
                    reason: reason.toString()
                });
                this.clients.delete(clientId);
            });

            // Handle errors
            ws.on('error', (error: Error) => {
                logger.error('WebSocket client error', { clientId, error: error.message });
                this.clients.delete(clientId);
            });

            // Send welcome message
            this.sendToClient(client, {
                type: 'welcome',
                data: {
                    clientId,
                    serverTime: new Date(),
                    authRequired: this.config.authRequired
                },
                timestamp: new Date()
            });
        });

        this.wss.on('error', (error: Error) => {
            logger.error('WebSocket server error', error);
        });
    }

    /**
     * Set up Redis pub/sub listeners for blockchain events
     */
    private async setupPubSubListeners(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            // Listen for blockchain sync progress
            await pubSubService.subscribe('blockchain:sync:progress', (message: any) => {
                this.broadcastToSubscribers('blockchain:sync:progress', {
                    type: 'sync_progress',
                    data: message,
                    timestamp: new Date()
                });
            });

            // Listen for new blocks
            await pubSubService.subscribe('blockchain:new_block', (message: any) => {
                this.broadcastToSubscribers('blockchain:blocks', {
                    type: 'new_block',
                    data: message,
                    timestamp: new Date()
                });
            });

            // Listen for new transactions
            await pubSubService.subscribe('blockchain:new_transaction', (message: any) => {
                this.broadcastToSubscribers('blockchain:transactions', {
                    type: 'new_transaction',
                    data: message,
                    timestamp: new Date()
                });
            });

            // Listen for nad.fun events
            await pubSubService.subscribe('nad-fun:events', (message: any) => {
                this.broadcastToSubscribers('nad-fun:events', {
                    type: 'nad_fun_events',
                    data: message,
                    timestamp: new Date()
                });
            });

            // Listen for reorganizations
            await pubSubService.subscribe('blockchain:reorganization', (message: any) => {
                this.broadcastToSubscribers('blockchain:reorg', {
                    type: 'reorganization',
                    data: message,
                    timestamp: new Date()
                });
            });

            logger.info('WebSocket pub/sub listeners setup complete');

        } catch (error) {
            logger.error('Failed to setup pub/sub listeners', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Handle incoming client messages
     */
    private handleClientMessage(client: WebSocketClient, data: Buffer, context?: LogContext): void {
        const logger = log.child(context || {});

        try {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            
            logger.debug('WebSocket message received', { 
                clientId: client.id,
                type: message.type,
                channel: message.channel
            });

            switch (message.type) {
                case 'authenticate':
                    this.handleAuthentication(client, message, context);
                    break;

                case 'subscribe':
                    this.handleSubscription(client, message, context);
                    break;

                case 'unsubscribe':
                    this.handleUnsubscription(client, message, context);
                    break;

                case 'ping':
                    this.handlePing(client, message, context);
                    break;

                case 'get_status':
                    this.handleStatusRequest(client, message, context);
                    break;

                default:
                    logger.warn('Unknown message type', { 
                        clientId: client.id,
                        type: message.type
                    });
                    this.sendError(client, `Unknown message type: ${message.type}`, message.requestId);
            }

        } catch (error) {
            logger.error('Failed to handle client message', { 
                clientId: client.id,
                error: error instanceof Error ? error.message : String(error)
            });
            this.sendError(client, 'Invalid message format');
        }
    }

    /**
     * Handle client authentication
     */
    private handleAuthentication(client: WebSocketClient, message: WebSocketMessage, context?: LogContext): void {
        const logger = log.child(context || {});

        // In a real implementation, you would validate the JWT token or API key
        // For now, we'll just mark the client as authenticated
        const { token, apiKey } = message.data || {};

        if (token || apiKey) {
            client.authenticated = true;
            client.userId = 'authenticated-user'; // Would extract from token
            client.apiKeyId = apiKey;
            
            logger.info('Client authenticated', { clientId: client.id });
            
            this.sendToClient(client, {
                type: 'auth_success',
                data: { authenticated: true },
                timestamp: new Date(),
                requestId: message.requestId
            });
        } else {
            this.sendError(client, 'Invalid authentication credentials', message.requestId);
        }
    }

    /**
     * Handle subscription requests
     */
    private handleSubscription(client: WebSocketClient, message: WebSocketMessage, context?: LogContext): void {
        const logger = log.child(context || {});

        if (this.config.authRequired && !client.authenticated) {
            this.sendError(client, 'Authentication required', message.requestId);
            return;
        }

        const { channel, filters } = message.data || {};
        
        if (!channel) {
            this.sendError(client, 'Channel is required for subscription', message.requestId);
            return;
        }

        // Validate subscription channel
        const validChannels = [
            'blockchain:blocks',
            'blockchain:transactions', 
            'blockchain:sync:progress',
            'nad-fun:events',
            'blockchain:reorg'
        ];

        if (!validChannels.includes(channel)) {
            this.sendError(client, `Invalid channel: ${channel}`, message.requestId);
            return;
        }

        client.subscriptions.add(channel);
        
        logger.info('Client subscribed to channel', { 
            clientId: client.id,
            channel,
            filters
        });

        this.sendToClient(client, {
            type: 'subscription_success',
            channel,
            data: { subscribed: true, filters },
            timestamp: new Date(),
            requestId: message.requestId
        });
    }

    /**
     * Handle unsubscription requests
     */
    private handleUnsubscription(client: WebSocketClient, message: WebSocketMessage, context?: LogContext): void {
        const logger = log.child(context || {});

        const { channel } = message.data || {};
        
        if (!channel) {
            this.sendError(client, 'Channel is required for unsubscription', message.requestId);
            return;
        }

        client.subscriptions.delete(channel);
        
        logger.info('Client unsubscribed from channel', { 
            clientId: client.id,
            channel
        });

        this.sendToClient(client, {
            type: 'unsubscription_success',
            channel,
            data: { unsubscribed: true },
            timestamp: new Date(),
            requestId: message.requestId
        });
    }

    /**
     * Handle ping messages
     */
    private handlePing(client: WebSocketClient, message: WebSocketMessage, context?: LogContext): void {
        client.lastPing = new Date();
        
        this.sendToClient(client, {
            type: 'pong',
            data: { serverTime: new Date() },
            timestamp: new Date(),
            requestId: message.requestId
        });
    }

    /**
     * Handle status requests
     */
    private handleStatusRequest(client: WebSocketClient, message: WebSocketMessage, context?: LogContext): void {
        const status = {
            connectedClients: this.clients.size,
            subscriptions: Array.from(client.subscriptions),
            serverUptime: process.uptime(),
            authenticated: client.authenticated
        };

        this.sendToClient(client, {
            type: 'status',
            data: status,
            timestamp: new Date(),
            requestId: message.requestId
        });
    }

    /**
     * Send message to a specific client
     */
    private sendToClient(client: WebSocketClient, message: WebSocketMessage): void {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Send error message to client
     */
    private sendError(client: WebSocketClient, error: string, requestId?: string): void {
        this.sendToClient(client, {
            type: 'error',
            data: { error },
            timestamp: new Date(),
            requestId
        });
    }

    /**
     * Broadcast message to all subscribers of a channel
     */
    private broadcastToSubscribers(channel: string, message: WebSocketMessage): void {
        let sentCount = 0;
        
        for (const client of this.clients.values()) {
            if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({ ...message, channel }));
                sentCount++;
            }
        }

        log.debug('Message broadcasted', { channel, sentCount, totalClients: this.clients.size });
    }

    /**
     * Start heartbeat mechanism
     */
    private startHeartbeat(context?: LogContext): void {
        const logger = log.child(context || {});

        this.heartbeatInterval = setInterval(() => {
            const now = new Date();
            const deadClients: string[] = [];

            for (const [clientId, client] of this.clients.entries()) {
                const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
                
                if (timeSinceLastPing > this.config.heartbeatInterval * 2) {
                    // Client hasn't responded to ping in too long
                    logger.warn('Client connection timeout', { clientId, timeSinceLastPing });
                    client.ws.close(1000, 'Connection timeout');
                    deadClients.push(clientId);
                } else if (client.ws.readyState === WebSocket.OPEN) {
                    // Send ping
                    this.sendToClient(client, {
                        type: 'ping',
                        data: { serverTime: now },
                        timestamp: now
                    });
                }
            }

            // Remove dead clients
            for (const clientId of deadClients) {
                this.clients.delete(clientId);
            }

        }, this.config.heartbeatInterval);

        logger.debug('WebSocket heartbeat started', { interval: this.config.heartbeatInterval });
    }

    /**
     * Generate unique client ID
     */
    private generateClientId(): string {
        return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Get connection statistics
     */
    getConnectionStats(): {
        totalConnections: number;
        authenticatedConnections: number;
        subscriptionCounts: Record<string, number>;
    } {
        const subscriptionCounts: Record<string, number> = {};
        let authenticatedConnections = 0;

        for (const client of this.clients.values()) {
            if (client.authenticated) {
                authenticatedConnections++;
            }

            for (const subscription of client.subscriptions) {
                subscriptionCounts[subscription] = (subscriptionCounts[subscription] || 0) + 1;
            }
        }

        return {
            totalConnections: this.clients.size,
            authenticatedConnections,
            subscriptionCounts
        };
    }

    /**
     * Health check implementation
     */
    async checkHealth(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = log.child(context || {});
        const startTime = Date.now();

        try {
            logger.debug('Performing WebSocket service health check');

            const stats = this.getConnectionStats();
            const duration = Date.now() - startTime;

            const isHealthy = this.isRunning && 
                             this.wss !== null && 
                             this.httpServer !== null;

            logger.debug('WebSocket service health check completed', { 
                duration,
                isHealthy,
                stats
            });

            return {
                service: this.serviceName,
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date(),
                details: {
                    isRunning: this.isRunning,
                    port: this.config.port,
                    ...stats,
                    responseTime: duration
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('WebSocket service health check failed', error instanceof Error ? error : new Error(String(error)));

            return {
                service: this.serviceName,
                status: 'unhealthy',
                timestamp: new Date(),
                error: error instanceof Error ? error.message : String(error),
                details: {
                    responseTime: duration
                }
            };
        }
    }
}