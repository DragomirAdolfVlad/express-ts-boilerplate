/**
 * Blockchain Tracker Interface
 * 
 * Application layer interface for blockchain tracking.
 * Follows Interface Segregation Principle.
 */

import { BlockchainEvent } from '../../domain/entities/blockchain-event.entity';

export interface TrackerConfiguration {
  readonly wsUrl: string;
  readonly httpUrl: string;
  readonly contractAddress: string;
  readonly reconnection: {
    readonly maxAttempts: number;
    readonly baseDelay: number;
    readonly backoffFactor: number;
  };
}

export interface TrackerMetrics {
  readonly isConnected: boolean;
  readonly uptime: number | null;
  readonly eventsProcessed: number;
  readonly eventsSkipped: number;
  readonly reconnectAttempts: number;
  readonly lastEventTime?: Date;
  readonly lastError?: string;
}

export interface TrackerHealthStatus {
  readonly status: 'healthy' | 'unhealthy' | 'connecting' | 'disconnected';
  readonly connected: boolean;
  readonly uptime: number | null;
  readonly lastError?: string;
  readonly lastEventTime?: Date;
}

export interface IBlockchainTracker {
  /**
   * Start the tracker
   */
  start(): Promise<void>;

  /**
   * Stop the tracker
   */
  stop(): Promise<void>;

  /**
   * Get current connection status
   */
  isConnected(): boolean;

  /**
   * Get tracker metrics
   */
  getMetrics(): TrackerMetrics;

  /**
   * Get health status
   */
  getHealthStatus(): TrackerHealthStatus;

  /**
   * Subscribe to events
   */
  onEvent(callback: (event: BlockchainEvent) => Promise<void>): void;
}