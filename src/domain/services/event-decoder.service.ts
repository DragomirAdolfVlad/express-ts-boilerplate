/**
 * Event Decoder Service Interface
 * 
 * Domain service for decoding blockchain events.
 * Follows Interface Segregation Principle.
 */

import { BlockchainEvent } from '../entities/blockchain-event.entity';

export interface RawBlockchainLog {
  readonly address: string;
  readonly topics: string[];
  readonly data: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly transactionHash: string;
  readonly transactionIndex: string;
  readonly logIndex: string;
  readonly removed: boolean;
}

export interface DecodingResult {
  readonly success: boolean;
  readonly event?: BlockchainEvent;
  readonly error?: string;
}

export interface IEventDecoderService {
  /**
   * Decode a raw blockchain log into a domain event
   */
  decode(log: RawBlockchainLog, phase: string): Promise<DecodingResult>;

  /**
   * Check if this decoder can handle the given log
   */
  canDecode(log: RawBlockchainLog): boolean;

  /**
   * Get supported event signatures
   */
  getSupportedSignatures(): string[];
}