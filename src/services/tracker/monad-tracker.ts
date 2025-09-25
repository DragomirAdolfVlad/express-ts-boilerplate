/**
 * Monad Blockchain Tracker Implementation
 * 
 * Concrete implementation of BaseTracker for Monad blockchain
 * Follows Single Responsibility Principle
 */

import WebSocket from 'ws';
import { BaseTracker } from './base-tracker';
import { TrackerConfig } from '../../types/tracker.interfaces';
import { RedisPub } from '../../tracker/redisPub';
import { decodeCurveLog, decodePoolLog } from '../../tracker/decode';

interface MonadLogNotification {
  jsonrpc: string;
  method: string;
  params: {
    subscription: string;
    result: any;
  };
}

export class MonadTracker extends BaseTracker {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptionId: string | null = null;
  private redisPub: RedisPub;

  constructor(private readonly config: TrackerConfig) {
    super('Monad');
    this.redisPub = new RedisPub(config.redis.url, config.redis.channel);
  }

  protected async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.wsUrl);
      
      this.ws.on('open', () => {
        this.logger.info('[Monad] WebSocket connected');
        this.setupEventHandlers();
        this.startPingPong();
        resolve();
      });

      this.ws.on('error', (error) => {
        this.logger.error('[Monad] WebSocket connection error:', { error: error.message });
        reject(error);
      });
    });
  }

  protected async subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const subscriptionMessage = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'monadLogs',
        params: [this.config.contractAddress]
      };

      // Listen for subscription response
      const responseHandler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.id && message.result) {
            this.subscriptionId = message.result;
            this.logger.info('[Monad] Subscription established', { 
              subscriptionId: this.subscriptionId 
            });
            this.ws?.off('message', responseHandler);
            resolve();
          } else if (message.error) {
            this.logger.error('[Monad] Subscription error:', message.error);
            reject(new Error(message.error.message || 'Subscription failed'));
          }
        } catch (error) {
          reject(error);
        }
      };

      this.ws.on('message', responseHandler);
      this.ws.send(JSON.stringify(subscriptionMessage));

      // Timeout after 10 seconds
      setTimeout(() => {
        this.ws?.off('message', responseHandler);
        reject(new Error('Subscription timeout'));
      }, 10000);
    });
  }

  protected async disconnect(): Promise<void> {
    this.stopPingPong();
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    
    this.subscriptionId = null;
  }

  protected async cleanup(): Promise<void> {
    // Any additional cleanup logic
    this.logger.info('[Monad] Cleanup complete');
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('pong', () => {
      this.logger.debug('[Monad] Received pong');
    });
  }

  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      // Only process log notifications
      if (message.method !== 'monadLogs' || !message.params?.result) {
        return;
      }

      this.incrementProcessed();
      await this.processLogNotification(message as MonadLogNotification);
      
    } catch (error) {
      this.incrementSkipped();
      this.logger.error('[Monad] Message parsing error:', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private async processLogNotification(message: MonadLogNotification): Promise<void> {
    try {
      const logData = message.params.result;
      
      // Convert to viem Log format for decoder compatibility
      const viemLog = this.convertToViemLog(logData);

      // Try to decode as curve event first
      const curveEvent = decodeCurveLog(viemLog);
      if (curveEvent) {
        await this.publishEvent(curveEvent, logData);
        return;
      }

      // Try to decode as pool/DEX event
      const poolEvent = decodePoolLog(viemLog);
      if (poolEvent) {
        await this.publishEvent(poolEvent, logData);
        return;
      }

      this.logger.debug('[Monad] Unknown event type', {
        topics: logData.topics,
        address: logData.address
      });

    } catch (error) {
      this.logger.error('[Monad] Log processing error:', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private convertToViemLog(logData: any): any {
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

  private async publishEvent(event: any, logData: any): Promise<void> {
    try {
      const payload = {
        phase: this.mapCommitStateToPhase(logData.commitState),
        t: Date.now(),
        blk: logData.blockNumber,
        tx: logData.transactionHash,
        ...this.convertDecodedToMonadEvent(event)
      };

      await this.redisPub.publish(payload);
      
      this.logger.debug('[Monad] Event published', {
        type: event.type,
        block: logData.blockNumber
      });
      
    } catch (error) {
      this.logger.error('[Monad] Failed to publish event:', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  private convertDecodedToMonadEvent(decoded: any): any {
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

  private mapCommitStateToPhase(commitState: string): string {
    switch (commitState) {
      case 'Proposed': return 'proposed';
      case 'Voted': return 'voted';  
      case 'Finalized': return 'finalized';
      case 'Verified': return 'verified';
      default: return 'unknown';
    }
  }

  private handleError(error: Error): void {
    this.logger.error('[Monad] WebSocket error:', { error: error.message });
    this.connected = false;
    // Could implement reconnection logic here
  }

  private handleClose(code: number, reason: Buffer): void {
    this.logger.warn('[Monad] WebSocket closed', { 
      code, 
      reason: reason.toString() 
    });
    this.connected = false;
    this.subscriptionId = null;
    this.stopPingPong();
    // Could implement reconnection logic here
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}