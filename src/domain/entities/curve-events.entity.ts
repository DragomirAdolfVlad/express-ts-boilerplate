/**
 * Curve Event Entities
 * 
 * Domain entities for bonding curve events.
 * Each event type is a separate entity following SRP.
 */

import { BlockchainEvent, BlockchainEventData } from './blockchain-event.entity';

export class CurveStateUpdateEvent extends BlockchainEvent {
  constructor(
    data: BlockchainEventData,
    private readonly token: string,
    private readonly reserves: {
      reserve1: bigint;
      reserve2: bigint;
      reserve3: bigint;
      reserve4: bigint;
    }
  ) {
    super(data);
  }

  get type(): string {
    return 'curve_state_update';
  }

  get tokenAddress(): string {
    return this.token;
  }

  get tokenReserves(): typeof this.reserves {
    return this.reserves;
  }

  toJSON(): Record<string, any> {
    return {
      type: this.type,
      token: this.token,
      reserve1: this.reserves.reserve1.toString(),
      reserve2: this.reserves.reserve2.toString(),
      reserve3: this.reserves.reserve3.toString(),
      reserve4: this.reserves.reserve4.toString(),
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      timestamp: this.timestamp.toISOString(),
      phase: this.phase
    };
  }
}

export class CurveTradeEvent extends BlockchainEvent {
  constructor(
    data: BlockchainEventData,
    private readonly trader: string,
    private readonly token: string,
    private readonly amounts: {
      amount1: bigint;
      amount2: bigint;
      wmonAmount?: bigint;
      tokenAmount?: bigint;
      isBuy?: boolean;
    },
    private readonly tradeType?: string
  ) {
    super(data);
  }

  get type(): string {
    return 'curve_trade';
  }

  get traderAddress(): string {
    return this.trader;
  }

  get tokenAddress(): string {
    return this.token;
  }

  get tradeAmounts(): typeof this.amounts {
    return this.amounts;
  }

  get eventType(): string | undefined {
    return this.tradeType;
  }

  toJSON(): Record<string, any> {
    return {
      type: this.type,
      trader: this.trader,
      token: this.token,
      amount1: this.amounts.amount1.toString(),
      amount2: this.amounts.amount2.toString(),
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      timestamp: this.timestamp.toISOString(),
      phase: this.phase
    };
  }
}

export class CurveTokenEvent extends BlockchainEvent {
  constructor(
    data: BlockchainEventData,
    private readonly token: string
  ) {
    super(data);
  }

  get type(): string {
    return 'curve_token_event';
  }

  get tokenAddress(): string {
    return this.token;
  }

  toJSON(): Record<string, any> {
    return {
      type: this.type,
      token: this.token,
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      timestamp: this.timestamp.toISOString(),
      phase: this.phase
    };
  }
}

export class CurvePairEvent extends BlockchainEvent {
  constructor(
    data: BlockchainEventData,
    private readonly token: string,
    private readonly pool: string
  ) {
    super(data);
  }

  get type(): string {
    return 'curve_pair_event';
  }

  get tokenAddress(): string {
    return this.token;
  }

  get poolAddress(): string {
    return this.pool;
  }

  toJSON(): Record<string, any> {
    return {
      type: this.type,
      token: this.token,
      pool: this.pool,
      blockNumber: this.blockNumber,
      blockHash: this.blockHash,
      timestamp: this.timestamp.toISOString(),
      phase: this.phase
    };
  }
}