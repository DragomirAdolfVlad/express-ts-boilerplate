/**
 * DEX Event Entities
 * 
 * Domain entities for DEX trading events.
 */

import { BlockchainEvent, BlockchainEventData } from './blockchain-event.entity';

export class DexSwapEvent extends BlockchainEvent {
  constructor(
    data: BlockchainEventData,
    private readonly pool: string,
    private readonly sender: string,
    private readonly recipient: string,
    private readonly amounts: {
      amount0: bigint;
      amount1: bigint;
    },
    private readonly tick: number
  ) {
    super(data);
  }

  get type(): string {
    return 'dex_swap';
  }

  get poolAddress(): string {
    return this.pool;
  }

  get senderAddress(): string {
    return this.sender;
  }

  get recipientAddress(): string {
    return this.recipient;
  }

  get swapAmounts(): typeof this.amounts {
    return this.amounts;
  }

  get swapTick(): number {
    return this.tick;
  }

  toJSON(): Record<string, any> {
    return {
      type: this.type,
      pool: this.pool,
      sender: this.sender,
      recipient: this.recipient,
      amount0: this.amounts.amount0.toString(),
      amount1: this.amounts.amount1.toString(),
      tick: this.tick,
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      timestamp: this.timestamp.toISOString(),
      phase: this.phase
    };
  }
}