/**
 * Redis Event Publisher Adapter
 * 
 * Infrastructure adapter for publishing events to Redis.
 * Implements the IEventPublisher interface.
 */

import Redis from 'ioredis';
import { IEventPublisher, PublishingConfiguration, PublishingResult } from '../../application/interfaces/event-publisher.interface';
import { BlockchainEvent } from '../../domain/entities/blockchain-event.entity';

export class RedisEventPublisherAdapter implements IEventPublisher {
  private redis: Redis;
  private isConnected = false;

  constructor(
    redisUrl: string,
    private readonly config: PublishingConfiguration
  ) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: config.retryAttempts || 3
    });

    this.setupEventHandlers();
  }

  async publish(event: BlockchainEvent): Promise<PublishingResult> {
    try {
      await this.ensureConnection();
      
      const payload = this.serializeEvent(event);
      await this.redis.publish(this.config.channel, payload);
      
      // Log human-readable summary
      this.logEventSummary(event);
      
      return {
        success: true,
        publishedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        publishedAt: new Date()
      };
    }
  }

  async publishBatch(events: BlockchainEvent[]): Promise<PublishingResult[]> {
    const results: PublishingResult[] = [];
    
    // Process in batches to avoid overwhelming Redis
    const batchSize = this.config.batchSize || 100;
    
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(event => this.publish(event))
      );
      results.push(...batchResults);
    }
    
    return results;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureConnection();
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.redis.connect();
      this.isConnected = true;
    }
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.isConnected = true;
    });

    this.redis.on('error', (error) => {
      console.error('[Redis Publisher] Connection error:', error);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      this.isConnected = false;
    });
  }

  private serializeEvent(event: BlockchainEvent): string {
    const replacer = (_key: string, value: any) => 
      typeof value === 'bigint' ? value.toString() : value;
    
    return JSON.stringify(event.toJSON(), replacer);
  }

  private logEventSummary(event: BlockchainEvent): void {
    const summary = this.createEventSummary(event);
    
    console.log(`[📡 EVENT] ${summary}`);
    console.log(`[📋 FULL DATA]`, JSON.stringify(event.toJSON(), null, 2));
    console.log(`[✅ PUBLISHED] Event sent to Redis channel: ${this.config.channel}`);
  }

  private createEventSummary(event: BlockchainEvent): string {
    const timestamp = event.timestamp.toLocaleTimeString();
    const block = event.blockNumber;
    
    switch (event.type) {
      case 'curve_state_update': {
        const curveEvent = event as any;
        return `🔄 CURVE STATE UPDATE | Token: ${this.formatAddress(curveEvent.tokenAddress)} | Block: ${block} | Time: ${timestamp}`;
      }
      
      case 'curve_trade': {
        const tradeEvent = event as any;
        return `💰 CURVE TRADE | Trader: ${this.formatAddress(tradeEvent.traderAddress)} | Token: ${this.formatAddress(tradeEvent.tokenAddress)} | Block: ${block} | Time: ${timestamp}`;
      }
      
      case 'curve_token_event': {
        const tokenEvent = event as any;
        return `🪙 TOKEN EVENT | Token: ${this.formatAddress(tokenEvent.tokenAddress)} | Block: ${block} | Time: ${timestamp}`;
      }
      
      case 'curve_pair_event': {
        const pairEvent = event as any;
        return `🔗 PAIR EVENT | Token: ${this.formatAddress(pairEvent.tokenAddress)} | Pool: ${this.formatAddress(pairEvent.poolAddress)} | Block: ${block} | Time: ${timestamp}`;
      }
      
      case 'dex_swap': {
        const swapEvent = event as any;
        return `🔄 DEX SWAP | Pool: ${this.formatAddress(swapEvent.poolAddress)} | Sender: ${this.formatAddress(swapEvent.senderAddress)} | Block: ${block} | Time: ${timestamp}`;
      }
      
      default:
        return `❓ UNKNOWN EVENT | Type: ${event.type} | Block: ${block} | Time: ${timestamp}`;
    }
  }

  private formatAddress(address: string): string {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}