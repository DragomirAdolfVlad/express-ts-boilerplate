/**
 * Blockchain Event Entity
 * 
 * Core business entity representing a blockchain event.
 * Follows Entity pattern from Domain-Driven Design.
 */

export interface BlockchainEventId {
  readonly transactionHash: string;
  readonly logIndex: number;
}

export interface BlockchainEventData {
  readonly id: BlockchainEventId;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly address: string;
  readonly timestamp: Date;
  readonly phase: EventPhase;
}

export enum EventPhase {
  PROPOSED = 'proposed',
  VOTED = 'voted',
  FINALIZED = 'finalized',
  VERIFIED = 'verified',
  UNKNOWN = 'unknown'
}

export abstract class BlockchainEvent {
  protected constructor(
    protected readonly data: BlockchainEventData
  ) {}

  get id(): BlockchainEventId {
    return this.data.id;
  }

  get blockNumber(): number {
    return this.data.blockNumber;
  }

  get blockHash(): string {
    return this.data.blockHash;
  }

  get address(): string {
    return this.data.address;
  }

  get timestamp(): Date {
    return this.data.timestamp;
  }

  get phase(): EventPhase {
    return this.data.phase;
  }

  abstract get type(): string;
  abstract toJSON(): Record<string, any>;
}