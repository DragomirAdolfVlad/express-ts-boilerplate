/**
 * Event Publisher Interface
 * 
 * Application layer interface for publishing events.
 * Follows Single Responsibility Principle.
 */

import { BlockchainEvent } from '../../domain/entities/blockchain-event.entity';

export interface PublishingConfiguration {
  readonly channel: string;
  readonly batchSize?: number;
  readonly retryAttempts?: number;
}

export interface PublishingResult {
  readonly success: boolean;
  readonly error?: string;
  readonly publishedAt: Date;
}

export interface IEventPublisher {
  /**
   * Publish a single event
   */
  publish(event: BlockchainEvent): Promise<PublishingResult>;

  /**
   * Publish multiple events in batch
   */
  publishBatch(events: BlockchainEvent[]): Promise<PublishingResult[]>;

  /**
   * Get publisher health status
   */
  isHealthy(): Promise<boolean>;

  /**
   * Close publisher connection
   */
  close(): Promise<void>;
}