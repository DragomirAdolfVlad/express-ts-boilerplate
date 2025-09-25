/**
 * Monad Blockchain Event Tracker Service
 * 
 * Tracks Monad blockchain events via WebSocket connection to QuickNode RPC.
 * Processes logs and identifies curve trading and DEX swap events.
 */

import WebSocket from 'ws';
import { IMonadTracker, TrackerConfig, TrackerMetrics, MonadEvent, MonadLogData } from '../types/tracker.interfaces';
import { RedisPub } from './redisPub';
import { decodeCurveLog, decodePoolLog } from './decode';
import { discoverPool } from './poolDiscover';
import { createRequestLogger } from '../utils/logger';

const logger = createRequestLogger('monad-tracker');

/**
 * Monad WebSocket subscription response interfaces
 */

interface MonadLogNotification {
  jsonrpc: string;
  method: string;
  params: {
    subscription: string;
    result: MonadLogData;
  };
}

/**
 * Monad tracker implementation
 */
export class MonadTracker implements IMonadTracker {
  // Metrics rotation threshold - reset counters every 1M messages to prevent overflow
  private static readonly METRICS_RESET_THRESHOLD = 1_000_000;

  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private startTime: Date | null = null;
  private subscriptionId: string | null = null;
  
  // Redis publisher for events
  private redisPub: RedisPub;
  
  // Active pools registry for DEX events
  private activePools = new Set<string>();
  
  private metrics: TrackerMetrics = {
    messagesProcessed: 0,
    messagesSkipped: 0,
    reconnectAttempts: 0,
    parser: {
      curveEventsProcessed: 0,
      poolEventsProcessed: 0,
      parseErrors: 0,
      unknownEvents: 0,
      totalParseCalls: 0,
      lastParseError: undefined,
      performanceStats: {
        averageParseTime: 0,
        maxParseTime: 0,
        minParseTime: Number.MAX_SAFE_INTEGER,
        totalParseTime: 0,
      },
    }
  };

  /**
   * Creates a new Monad tracker
   * @param config - Tracker configuration
   */
  constructor(private readonly config: TrackerConfig) {
    // Initialize Redis publisher
    this.redisPub = new RedisPub(config.redis.url, config.redis.channel);
    
    logger.info('[MonadTracker] Initialized with config:', {
      wsUrl: config.wsUrl,
      contractAddress: config.contractAddress,
      redisChannel: config.redis.channel
    });
  }

  /**
   * Connects to WebSocket and starts tracking
   */
  public connect(): void {
    this.startTime = new Date();
    
    logger.info('[MonadTracker] Connecting to WebSocket...', { wsUrl: this.config.wsUrl });
    this.ws = new WebSocket(this.config.wsUrl);
    this.setupEventHandlers();
  }

  /**
   * Sets up WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => this.handleConnect());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => this.handleError(err));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('pong', () => {
      logger.debug('[MonadTracker] Received pong');
    });
  }

  /**
   * Handles WebSocket connection
   */
  private handleConnect(): void {
    logger.info('[MonadTracker] WebSocket connected');
    this.connected = true;
    this.reconnectAttempts = 0;

    // Subscribe to logs for the BondingCurve contract
    const subscriptionMessage = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'monadLogs',
      params: [this.config.contractAddress]
    };

    logger.info('[MonadTracker] Sending subscription request', { 
      contract: this.config.contractAddress 
    });
    
    this.ws!.send(JSON.stringify(subscriptionMessage));
    this.startPingPong();
  }

  /**
   * Handles incoming WebSocket messages
   */
  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      // Handle subscription response
      if (message.id && message.result) {
        this.subscriptionId = message.result;
        logger.info('[MonadTracker] Subscription established', { 
          subscriptionId: this.subscriptionId 
        });
        return;
      }

      // Handle subscription error
      if (message.error) {
        logger.error('[MonadTracker] Subscription error:', message.error);
        return;
      }

      // Only process log notifications
      if (message.method !== 'monadLogs' || !message.params?.result) {
        return;
      }

      this.metrics.messagesProcessed++;
      this.checkAndResetMetrics();
      await this.processLogNotification(message as MonadLogNotification);
      
    } catch (error) {
      this.metrics.messagesSkipped++;
      this.metrics.parser.parseErrors++;
      this.metrics.parser.lastParseError = error instanceof Error ? error.message : String(error);
      logger.error('[MonadTracker] Message parsing error:', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Processes log notification - Core functionality
   */
  private async processLogNotification(message: MonadLogNotification): Promise<void> {
    const startTime = Date.now();
    this.metrics.parser.totalParseCalls++;

    try {
      const logData = message.params.result;
      const phase = this.mapCommitStateToPhase(logData.commitState);

      logger.debug('[MonadTracker] Processing log', {
        address: logData.address,
        topics: logData.topics,
        phase: phase
      });

      // Convert MonadLogData to viem Log format for decoder compatibility
      const viemLog = this.convertToViemLog(logData);

      // Try to decode as curve event first
      const curveEvent = decodeCurveLog(viemLog);
      if (curveEvent) {
        this.metrics.parser.curveEventsProcessed++;
        await this.publishEvent(this.convertDecodedToMonadEvent(curveEvent), phase, logData);
        this.updateParseMetrics(startTime);
        return;
      }

      // Auto-discover and monitor DEX pools for tokens we see in curve events
      if (logData.topics.length > 1) {
        const tokenAddress = logData.topics[1];
        if (tokenAddress && !this.activePools.has(tokenAddress)) {
          await this.discoverAndMonitorPool(tokenAddress);
        }
      }

      // Try to decode as pool/DEX event
      const poolEvent = decodePoolLog(viemLog);
      if (poolEvent) {
        this.metrics.parser.poolEventsProcessed++;
        await this.publishEvent(this.convertDecodedToMonadEvent(poolEvent), phase, logData);
        this.updateParseMetrics(startTime);
        return;
      }

      // Unknown event type
      this.metrics.parser.unknownEvents++;
      logger.debug('[MonadTracker] Unknown event type', {
        topics: logData.topics,
        address: logData.address
      });

    } catch (error) {
      this.metrics.parser.parseErrors++;
      this.metrics.parser.lastParseError = error instanceof Error ? error.message : String(error);
      logger.error('[MonadTracker] Log processing error:', { error: error instanceof Error ? error.message : String(error) });
    }

    this.updateParseMetrics(startTime);
  }

  /**
   * Converts MonadLogData to viem Log format for decoder compatibility
   */
  private convertToViemLog(logData: MonadLogData): any {
    return {
      address: logData.address as `0x${string}`,
      blockHash: logData.blockHash as `0x${string}` | null,
      blockNumber: BigInt(logData.blockNumber),
      data: logData.data as `0x${string}`,
      logIndex: logData.logIndex,
      transactionHash: logData.transactionHash as `0x${string}` | null,
      transactionIndex: logData.transactionIndex,
      removed: false,
      topics: logData.topics as [`0x${string}`, ...Array<`0x${string}`>]
    };
  }

  /**
   * Converts decoded event to MonadEvent format
   */
  private convertDecodedToMonadEvent(decoded: any): MonadEvent {
    switch (decoded.type) {
      case 'curve_state_update':
        return {
          type: 'curve_state_update',
          token: decoded.token,
          reserve1: decoded.reserve1.toString(),
          reserve2: decoded.reserve2.toString(),
          reserve3: decoded.reserve3.toString(),
          reserve4: decoded.reserve4.toString(),
        };
      case 'curve_trade':
        return {
          type: 'curve_trade',
          trader: decoded.trader,
          token: decoded.token,
          amount1: decoded.amount1.toString(),
          amount2: decoded.amount2.toString(),
        };
      case 'curve_token_event':
        return {
          type: 'curve_token_event',
          token: decoded.token,
        };
      case 'curve_pair_event':
        return {
          type: 'curve_pair_event',
          token: decoded.token,
          pool: decoded.pool,
        };
      case 'dex_swap':
        return {
          type: 'dex_swap',
          pool: decoded.pool,
          sender: decoded.sender,
          recipient: decoded.recipient,
          amount0: decoded.amount0.toString(),
          amount1: decoded.amount1.toString(),
          tick: decoded.tick,
        };
      default:
        throw new Error(`Unknown decoded event type: ${decoded.type}`);
    }
  }

  /**
   * Publishes decoded event to Redis
   */
  private async publishEvent(event: MonadEvent, phase: string, logData: MonadLogData): Promise<void> {
    try {
      const payload = {
        phase,
        t: Date.now(),
        blk: logData.blockNumber,
        tx: logData.transactionHash,
        ...event
      };

      await this.redisPub.publish(payload);
      this.metrics.lastEventTime = new Date();
      
      logger.debug('[MonadTracker] Event published', {
        type: event.type,
        phase,
        block: logData.blockNumber
      });
      
    } catch (error) {
      logger.error('[MonadTracker] Failed to publish event:', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Discovers and monitors DEX pool for a token
   */
  private async discoverAndMonitorPool(tokenAddress: string): Promise<void> {
    try {
      if (!process.env['FACTORY'] || !process.env['WMON'] || !process.env['POOL_FEE']) {
        return;
      }

      const poolAddress = await discoverPool(
        tokenAddress as `0x${string}`,
        process.env['WMON'] as `0x${string}`,
        Number(process.env['POOL_FEE']),
        process.env['FACTORY'] as `0x${string}`
      );

      if (poolAddress) {
        this.activePools.add(poolAddress);
        logger.info('[MonadTracker] Discovered and monitoring pool', {
          token: tokenAddress,
          pool: poolAddress
        });
      }
    } catch (error) {
      logger.error('[MonadTracker] Pool discovery failed:', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Maps Monad commit state to phase string
   */
  private mapCommitStateToPhase(commitState: string): string {
    switch (commitState) {
      case 'Proposed': return 'proposed';
      case 'Voted': return 'voted';  
      case 'Finalized': return 'finalized';
      case 'Verified': return 'verified';
      default: return 'unknown';
    }
  }

  /**
   * Updates parse performance metrics
   */
  private updateParseMetrics(startTime: number): void {
    const parseTime = Date.now() - startTime;
    const stats = this.metrics.parser.performanceStats;
    
    stats.totalParseTime += parseTime;
    stats.maxParseTime = Math.max(stats.maxParseTime, parseTime);
    stats.minParseTime = Math.min(stats.minParseTime, parseTime);
    stats.averageParseTime = stats.totalParseTime / this.metrics.parser.totalParseCalls;
  }

  /**
   * Handles WebSocket errors
   */
  private handleError(error: Error): void {
    logger.error('[MonadTracker] WebSocket error:', { error: error.message });
    this.connected = false;
    this.attemptReconnect();
  }

  /**
   * Handles WebSocket close
   */
  private handleClose(code: number, reason: Buffer): void {
    logger.warn('[MonadTracker] WebSocket closed', { 
      code, 
      reason: reason.toString() 
    });
    this.connected = false;
    this.subscriptionId = null;
    this.stopPingPong();
    this.attemptReconnect();
  }

  /**
   * Attempts to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      logger.error('[MonadTracker] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      this.config.reconnect.baseDelay * Math.pow(this.config.reconnect.backoffFactor, this.reconnectAttempts),
      this.config.reconnect.baseDelay * 10 // Cap at 10x base delay
    );

    this.reconnectAttempts++;
    this.metrics.reconnectAttempts = this.reconnectAttempts;

    logger.info('[MonadTracker] Reconnecting...', { 
      delay, 
      attempt: this.reconnectAttempts 
    });

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Starts ping-pong mechanism
   */
  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stops ping-pong mechanism
   */
  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Prevents metrics counter overflow by resetting at threshold
   */
  private checkAndResetMetrics(): void {
    if (this.metrics.messagesProcessed >= MonadTracker.METRICS_RESET_THRESHOLD) {
      logger.info('[MonadTracker] Metrics reset at threshold', { 
        threshold: MonadTracker.METRICS_RESET_THRESHOLD 
      });
      
      this.metrics.messagesProcessed = 0;
      this.metrics.messagesSkipped = 0;
      
      // Reset parser metrics but keep performance stats for trending
      const currentStats = { ...this.metrics.parser.performanceStats };
      this.metrics.parser = {
        curveEventsProcessed: 0,
        poolEventsProcessed: 0,
        parseErrors: 0,
        unknownEvents: 0,
        totalParseCalls: 0,
        lastParseError: undefined,
        performanceStats: currentStats,
      };
    }
  }

  /**
   * Gets connection status
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Gets uptime in milliseconds
   */
  public getUptime(): number | null {
    if (!this.startTime) return null;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Gets current metrics
   */
  public getMetrics(): TrackerMetrics {
    return { ...this.metrics };
  }

  /**
   * Stops tracking and cleans up resources
   */
  public shutdown(): void {
    logger.info('[MonadTracker] Shutting down tracker');
    
    this.stopPingPong();
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    
    this.connected = false;
    this.subscriptionId = null;
    this.activePools.clear();
    
    logger.info('[MonadTracker] Tracker shutdown complete');
  }
}