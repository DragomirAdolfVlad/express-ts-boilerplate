/**
 * Event Repository Interface
 * 
 * Repository pattern interface for event persistence.
 * Follows Dependency Inversion Principle.
 */

import { BlockchainEvent } from '../entities/blockchain-event.entity';

export interface EventFilter {
  readonly blockRange?: {
    from: number;
    to: number;
  };
  readonly eventTypes?: string[];
  readonly addresses?: string[];
  readonly timeRange?: {
    from: Date;
    to: Date;
  };
}

export interface PaginationOptions {
  readonly page: number;
  readonly limit: number;
}

export interface EventQueryResult {
  readonly events: BlockchainEvent[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface IEventRepository {
  /**
   * Save a blockchain event
   */
  save(event: BlockchainEvent): Promise<void>;

  /**
   * Save multiple blockchain events
   */
  saveMany(events: BlockchainEvent[]): Promise<void>;

  /**
   * Find events by filter criteria
   */
  findByFilter(
    filter: EventFilter,
    pagination?: PaginationOptions
  ): Promise<EventQueryResult>;

  /**
   * Find event by transaction hash and log index
   */
  findById(transactionHash: string, logIndex: number): Promise<BlockchainEvent | null>;

  /**
   * Get latest block number processed
   */
  getLatestBlockNumber(): Promise<number | null>;

  /**
   * Count events by type
   */
  countByType(eventType: string): Promise<number>;
}