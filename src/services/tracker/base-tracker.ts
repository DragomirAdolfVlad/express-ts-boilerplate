/**
 * Abstract Base Tracker
 * 
 * Base class for all blockchain trackers following Open/Closed Principle
 */

import { IBlockchainTracker, ITrackerMetrics, ITrackerHealthStatus } from './interfaces';
import { createRequestLogger } from '../../utils/logger';

export abstract class BaseTracker implements IBlockchainTracker {
  protected logger: ReturnType<typeof createRequestLogger>;
  protected startTime: Date | null = null;
  protected connected = false;
  protected lastError?: string;
  protected lastEventTime?: Date;
  
  protected metrics = {
    messagesProcessed: 0,
    messagesSkipped: 0,
    reconnectAttempts: 0,
  };

  constructor(protected readonly name: string) {
    this.logger = createRequestLogger(`${name.toLowerCase()}-tracker`);
  }

  /**
   * Template method for starting tracker
   */
  public async start(): Promise<void> {
    try {
      this.startTime = new Date();
      this.logger.info(`[${this.name}] Starting tracker...`);
      
      await this.connect();
      await this.subscribe();
      
      this.connected = true;
      this.logger.info(`[${this.name}] Tracker started successfully`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${this.name}] Failed to start tracker:`, { error: this.lastError });
      throw error;
    }
  }

  /**
   * Template method for stopping tracker
   */
  public async stop(): Promise<void> {
    try {
      this.logger.info(`[${this.name}] Stopping tracker...`);
      
      await this.disconnect();
      await this.cleanup();
      
      this.connected = false;
      this.startTime = null;
      this.logger.info(`[${this.name}] Tracker stopped successfully`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${this.name}] Error stopping tracker:`, { error: this.lastError });
      throw error;
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getMetrics(): ITrackerMetrics {
    return {
      ...this.metrics,
      uptime: this.getUptime(),
      isConnected: this.connected,
      lastEventTime: this.lastEventTime,
    };
  }

  public getHealthStatus(): ITrackerHealthStatus {
    let status: ITrackerHealthStatus['status'] = 'healthy';
    
    if (!this.connected) {
      status = 'disconnected';
    } else if (this.lastError) {
      status = 'unhealthy';
    }
    
    return {
      status,
      connected: this.connected,
      uptime: this.getUptime(),
      lastError: this.lastError,
      lastEventTime: this.lastEventTime,
    };
  }

  protected getUptime(): number | null {
    if (!this.startTime) return null;
    return Date.now() - this.startTime.getTime();
  }

  protected incrementProcessed(): void {
    this.metrics.messagesProcessed++;
    this.lastEventTime = new Date();
  }

  protected incrementSkipped(): void {
    this.metrics.messagesSkipped++;
  }

  protected incrementReconnects(): void {
    this.metrics.reconnectAttempts++;
  }

  // Abstract methods that subclasses must implement
  protected abstract connect(): Promise<void>;
  protected abstract subscribe(): Promise<void>;
  protected abstract disconnect(): Promise<void>;
  protected abstract cleanup(): Promise<void>;
}