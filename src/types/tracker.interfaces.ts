/**
 * Monad Tracker Interfaces
 * 
 * TypeScript interfaces for the Monad blockchain event tracker service.
 */

export interface TrackerConfig {
  wsUrl: string;
  httpUrl: string;
  contractAddress: string;
  redis: {
    url: string;
    channel: string;
  };
  reconnect: {
    maxAttempts: number;
    baseDelay: number;
    backoffFactor: number;
  };
}

export interface TrackerMetrics {
  messagesProcessed: number;
  messagesSkipped: number;
  reconnectAttempts: number;
  lastEventTime?: Date;
  parser: {
    curveEventsProcessed: number;
    poolEventsProcessed: number;
    parseErrors: number;
    unknownEvents: number;
    totalParseCalls: number;
    lastParseError?: string;
    performanceStats: {
      averageParseTime: number;
      maxParseTime: number;
      minParseTime: number;
      totalParseTime: number;
    };
  };
}

export interface IMonadTracker {
  connect(): void;
  isConnected(): boolean;
  getUptime(): number | null;
  getMetrics(): TrackerMetrics;
  shutdown(): void;
}

// Event type definitions for decoded events
export interface CurveStateUpdateEvent {
  type: 'curve_state_update';
  token: string;
  reserve1: string;
  reserve2: string;
  reserve3: string;
  reserve4: string;
}

export interface CurveTradeEvent {
  type: 'curve_trade';
  trader: string;
  token: string;
  amount1: string;
  amount2: string;
}

export interface CurveTokenEvent {
  type: 'curve_token_event';
  token: string;
}

export interface CurvePairEvent {
  type: 'curve_pair_event';
  token: string;
  pool: string;
}

export interface DexSwapEvent {
  type: 'dex_swap';
  pool: string;
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  tick: number;
}

export type MonadEvent = CurveStateUpdateEvent | CurveTradeEvent | CurveTokenEvent | CurvePairEvent | DexSwapEvent;

export interface MonadLogData {
  blockId: string;
  commitState: 'Proposed' | 'Voted' | 'Finalized' | 'Verified';
  address: string;
  topics: string[];
  data: string;
  blockHash: string;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
  removed: boolean;
}