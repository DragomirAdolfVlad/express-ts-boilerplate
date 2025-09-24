/**
 * nad.fun Program Service
 * Handles nad.fun specific event parsing and token tracking
 */

import { PrismaClient, NadFunEvent, NadFunToken, NadFunEventType, Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from '../database/service-base';
import { MonadClientService, MonadLog } from './monad-client';

// nad.fun program event signatures (example signatures - would need actual ones)
const NAD_FUN_EVENT_SIGNATURES = {
    TOKEN_CREATED: '0x1234567890abcdef...', // TokenCreated(address,string,string,uint256)
    TOKEN_BOUGHT: '0x2345678901bcdef0...', // TokenBought(address,address,uint256,uint256)
    TOKEN_SOLD: '0x3456789012cdef01...', // TokenSold(address,address,uint256,uint256)
    LIQUIDITY_ADDED: '0x456789012cdef012...', // LiquidityAdded(address,uint256)
    LIQUIDITY_REMOVED: '0x56789012cdef0123...', // LiquidityRemoved(address,uint256)
    PRICE_UPDATED: '0x6789012cdef01234...', // PriceUpdated(address,uint256)
};

export interface CreateNadFunEventData {
    txHash: string;
    eventType: NadFunEventType;
    programAddress: string;
    userAddress: string;
    tokenAddress?: string;
    amount?: string; // Wei amount as string
    price?: string; // Price with 18 decimals as string
    metadata?: any;
    blockNumber: bigint;
    logIndex: number;
    timestamp: Date;
}

export interface CreateNadFunTokenData {
    tokenAddress: string;
    name: string;
    symbol: string;
    totalSupply: string; // Wei amount as string
    creator: string;
    creationTx: string;
    currentPrice?: string; // Price with 18 decimals
    metadata?: any;
}

export interface TokenPriceUpdate {
    tokenAddress: string;
    price: string; // Price with 18 decimals
    volume: string;
    marketCap?: string;
    blockNumber: bigint;
    timestamp: Date;
}

export class NadFunService extends HealthCheckableService {
    private prisma: PrismaClient;
    private monadClient: MonadClientService;
    
    // nad.fun program addresses (would be configured based on actual deployment)
    private readonly NAD_FUN_PROGRAM_ADDRESSES = [
        '0x1234567890123456789012345678901234567890', // Main nad.fun program
        '0x2345678901234567890123456789012345678901', // Token factory
        // Add more as needed
    ];

    constructor(prisma?: PrismaClient, monadClient?: MonadClientService) {
        super('NadFunService');
        this.prisma = prisma || getPrismaClient();
        this.monadClient = monadClient || new MonadClientService();
    }

    /**
     * Parse blockchain logs to extract nad.fun events
     */
    async parseNadFunEvents(logs: MonadLog[], context?: LogContext): Promise<CreateNadFunEventData[]> {
        const logger = log.child(context || {});
        const events: CreateNadFunEventData[] = [];

        try {
            logger.debug('Parsing nad.fun events from logs', { logsCount: logs.length });

            for (const logEntry of logs) {
                // Check if log is from a nad.fun program address
                if (!this.NAD_FUN_PROGRAM_ADDRESSES.includes(logEntry.address.toLowerCase())) {
                    continue;
                }

                // Parse based on event signature
                const eventSignature = logEntry.topics[0];
                const parsedEvent = await this.parseEventBySignature(logEntry, eventSignature, context);
                
                if (parsedEvent) {
                    events.push(parsedEvent);
                }
            }

            logger.debug('nad.fun events parsed', { eventsCount: events.length });
            return events;

        } catch (error) {
            logger.error('Failed to parse nad.fun events', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Parse individual event based on signature
     */
    private async parseEventBySignature(
        logEntry: MonadLog, 
        signature: string, 
        context?: LogContext
    ): Promise<CreateNadFunEventData | null> {
        const logger = log.child(context || {});

        try {
            switch (signature) {
                case NAD_FUN_EVENT_SIGNATURES.TOKEN_CREATED:
                    return this.parseTokenCreatedEvent(logEntry, context);
                
                case NAD_FUN_EVENT_SIGNATURES.TOKEN_BOUGHT:
                    return this.parseTokenBoughtEvent(logEntry, context);
                
                case NAD_FUN_EVENT_SIGNATURES.TOKEN_SOLD:
                    return this.parseTokenSoldEvent(logEntry, context);
                
                case NAD_FUN_EVENT_SIGNATURES.LIQUIDITY_ADDED:
                    return this.parseLiquidityAddedEvent(logEntry, context);
                
                case NAD_FUN_EVENT_SIGNATURES.LIQUIDITY_REMOVED:
                    return this.parseLiquidityRemovedEvent(logEntry, context);
                
                case NAD_FUN_EVENT_SIGNATURES.PRICE_UPDATED:
                    return this.parsePriceUpdatedEvent(logEntry, context);
                
                default:
                    logger.debug('Unknown event signature', { signature });
                    return null;
            }

        } catch (error) {
            logger.error('Failed to parse event by signature', { 
                signature,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    /**
     * Parse TokenCreated event
     */
    private async parseTokenCreatedEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        // This is a simplified example - actual implementation would use proper ABI decoding
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`; // Extract address from topic
        const creator = `0x${logEntry.topics[2].slice(26)}`;
        
        // In real implementation, you'd decode the data field to get name, symbol, supply
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.TOKEN_CREATED,
            programAddress: logEntry.address,
            userAddress: creator,
            tokenAddress: tokenAddress,
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(), // Would get from block timestamp
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Parse TokenBought event
     */
    private async parseTokenBoughtEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`;
        const buyer = `0x${logEntry.topics[2].slice(26)}`;
        
        // Decode amount and price from data field (simplified)
        const amount = BigInt(`0x${logEntry.data.slice(2, 66)}`);
        const price = BigInt(`0x${logEntry.data.slice(66, 130)}`);
        
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.TOKEN_BOUGHT,
            programAddress: logEntry.address,
            userAddress: buyer,
            tokenAddress: tokenAddress,
            amount: amount.toString(),
            price: price.toString(),
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(),
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Parse TokenSold event
     */
    private async parseTokenSoldEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`;
        const seller = `0x${logEntry.topics[2].slice(26)}`;
        
        const amount = BigInt(`0x${logEntry.data.slice(2, 66)}`);
        const price = BigInt(`0x${logEntry.data.slice(66, 130)}`);
        
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.TOKEN_SOLD,
            programAddress: logEntry.address,
            userAddress: seller,
            tokenAddress: tokenAddress,
            amount: amount.toString(),
            price: price.toString(),
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(),
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Parse LiquidityAdded event
     */
    private async parseLiquidityAddedEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`;
        const provider = `0x${logEntry.topics[2].slice(26)}`;
        const amount = BigInt(`0x${logEntry.data.slice(2, 66)}`);
        
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.LIQUIDITY_ADDED,
            programAddress: logEntry.address,
            userAddress: provider,
            tokenAddress: tokenAddress,
            amount: amount.toString(),
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(),
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Parse LiquidityRemoved event
     */
    private async parseLiquidityRemovedEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`;
        const provider = `0x${logEntry.topics[2].slice(26)}`;
        const amount = BigInt(`0x${logEntry.data.slice(2, 66)}`);
        
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.LIQUIDITY_REMOVED,
            programAddress: logEntry.address,
            userAddress: provider,
            tokenAddress: tokenAddress,
            amount: amount.toString(),
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(),
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Parse PriceUpdated event
     */
    private async parsePriceUpdatedEvent(logEntry: MonadLog, context?: LogContext): Promise<CreateNadFunEventData> {
        const tokenAddress = `0x${logEntry.topics[1].slice(26)}`;
        const price = BigInt(`0x${logEntry.data.slice(2, 66)}`);
        
        return {
            txHash: logEntry.transactionHash,
            eventType: NadFunEventType.PRICE_UPDATED,
            programAddress: logEntry.address,
            userAddress: logEntry.address, // Program address as user for price updates
            tokenAddress: tokenAddress,
            price: price.toString(),
            blockNumber: BigInt(logEntry.blockNumber),
            logIndex: parseInt(logEntry.logIndex),
            timestamp: new Date(),
            metadata: {
                logData: logEntry.data,
                topics: logEntry.topics
            }
        };
    }

    /**
     * Store nad.fun event in database
     */
    async storeNadFunEvent(eventData: CreateNadFunEventData, context?: LogContext): Promise<NadFunEvent> {
        const logger = log.child(context || {});

        try {
            logger.debug('Storing nad.fun event', { 
                txHash: eventData.txHash,
                eventType: eventData.eventType,
                tokenAddress: eventData.tokenAddress
            });

            const event = await this.prisma.nadFunEvent.create({
                data: {
                    txHash: eventData.txHash,
                    eventType: eventData.eventType,
                    programAddress: eventData.programAddress,
                    userAddress: eventData.userAddress,
                    tokenAddress: eventData.tokenAddress,
                    amount: eventData.amount ? new Prisma.Decimal(eventData.amount) : null,
                    price: eventData.price ? new Prisma.Decimal(eventData.price) : null,
                    metadata: eventData.metadata ? JSON.stringify(eventData.metadata) : null,
                    blockNumber: eventData.blockNumber,
                    logIndex: eventData.logIndex,
                    timestamp: eventData.timestamp
                }
            });

            logger.debug('nad.fun event stored successfully', { eventId: event.id });
            return event;

        } catch (error) {
            logger.error('Failed to store nad.fun event', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to store nad.fun event ${eventData.txHash}`,
                'create',
                'nad_fun_events',
                context
            );
        }
    }

    /**
     * Create or update nad.fun token
     */
    async upsertNadFunToken(tokenData: CreateNadFunTokenData, context?: LogContext): Promise<NadFunToken> {
        const logger = log.child(context || {});

        try {
            logger.debug('Upserting nad.fun token', { 
                tokenAddress: tokenData.tokenAddress,
                name: tokenData.name,
                symbol: tokenData.symbol
            });

            const token = await this.prisma.nadFunToken.upsert({
                where: { tokenAddress: tokenData.tokenAddress },
                update: {
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    totalSupply: new Prisma.Decimal(tokenData.totalSupply),
                    currentPrice: tokenData.currentPrice ? new Prisma.Decimal(tokenData.currentPrice) : null,
                    metadata: tokenData.metadata ? JSON.stringify(tokenData.metadata) : null,
                    updatedAt: new Date()
                },
                create: {
                    tokenAddress: tokenData.tokenAddress,
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    totalSupply: new Prisma.Decimal(tokenData.totalSupply),
                    creator: tokenData.creator,
                    creationTx: tokenData.creationTx,
                    currentPrice: tokenData.currentPrice ? new Prisma.Decimal(tokenData.currentPrice) : null,
                    metadata: tokenData.metadata ? JSON.stringify(tokenData.metadata) : null
                }
            });

            logger.debug('nad.fun token upserted successfully', { tokenId: token.id });
            return token;

        } catch (error) {
            logger.error('Failed to upsert nad.fun token', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to upsert nad.fun token ${tokenData.tokenAddress}`,
                'upsert',
                'nad_fun_tokens',
                context
            );
        }
    }

    /**
     * Update token price and create price history
     */
    async updateTokenPrice(priceUpdate: TokenPriceUpdate, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            logger.debug('Updating token price', { 
                tokenAddress: priceUpdate.tokenAddress,
                price: priceUpdate.price
            });

            // Update token current price
            await this.prisma.nadFunToken.update({
                where: { tokenAddress: priceUpdate.tokenAddress },
                data: {
                    currentPrice: new Prisma.Decimal(priceUpdate.price),
                    volume24h: new Prisma.Decimal(priceUpdate.volume),
                    marketCap: priceUpdate.marketCap ? new Prisma.Decimal(priceUpdate.marketCap) : null,
                    updatedAt: new Date()
                }
            });

            // Create price history entry
            await this.prisma.tokenPriceHistory.create({
                data: {
                    tokenAddress: priceUpdate.tokenAddress,
                    price: new Prisma.Decimal(priceUpdate.price),
                    volume: new Prisma.Decimal(priceUpdate.volume),
                    marketCap: priceUpdate.marketCap ? new Prisma.Decimal(priceUpdate.marketCap) : null,
                    blockNumber: priceUpdate.blockNumber,
                    timestamp: priceUpdate.timestamp
                }
            });

            logger.debug('Token price updated successfully');

        } catch (error) {
            logger.error('Failed to update token price', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to update price for token ${priceUpdate.tokenAddress}`,
                'update',
                'nad_fun_tokens',
                context
            );
        }
    }

    /**
     * Get nad.fun events for a specific token
     */
    async getTokenEvents(
        tokenAddress: string,
        eventTypes?: NadFunEventType[],
        page: number = 1,
        limit: number = 50,
        context?: LogContext
    ): Promise<{
        data: NadFunEvent[];
        total: number;
        page: number;
        totalPages: number;
    }> {
        const logger = log.child(context || {});

        try {
            logger.debug('Getting token events', { tokenAddress, eventTypes, page, limit });

            const skip = (page - 1) * limit;
            
            const where: any = { tokenAddress };
            if (eventTypes && eventTypes.length > 0) {
                where.eventType = { in: eventTypes };
            }

            const [events, total] = await Promise.all([
                this.prisma.nadFunEvent.findMany({
                    where,
                    orderBy: { timestamp: 'desc' },
                    skip,
                    take: limit
                }),
                this.prisma.nadFunEvent.count({ where })
            ]);

            const totalPages = Math.ceil(total / limit);

            logger.debug('Token events retrieved', { 
                tokenAddress,
                count: events.length,
                total,
                totalPages
            });

            return {
                data: events,
                total,
                page,
                totalPages
            };

        } catch (error) {
            logger.error('Failed to get token events', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to get events for token ${tokenAddress}`,
                'findMany',
                'nad_fun_events',
                context
            );
        }
    }

    /**
     * Health check implementation
     */
    async checkHealth(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = log.child(context || {});
        const startTime = Date.now();

        try {
            logger.debug('Performing nad.fun service health check');

            // Check database connectivity
            await this.prisma.$queryRaw`SELECT 1`;

            // Check if we have recent nad.fun events
            const recentEvents = await this.prisma.nadFunEvent.count({
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    }
                }
            });

            const duration = Date.now() - startTime;

            logger.debug('nad.fun service health check completed', { 
                duration,
                recentEvents
            });

            return {
                service: this.serviceName,
                status: 'healthy',
                timestamp: new Date(),
                details: {
                    databaseConnected: true,
                    recentEvents,
                    responseTime: duration
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('nad.fun service health check failed', error instanceof Error ? error : new Error(String(error)));

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