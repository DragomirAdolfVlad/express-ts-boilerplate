/**
 * Worker Pool Types
 * Type definitions for the high-performance worker thread pool
 */

import { DecodedEvent } from '../binary-event-decoder';

export interface WorkerPoolConfig {
  workerCount?: number; // Default: CPU cores
  queueSize?: number; // Default: 10000
  healthCheckInterval?: number; // Default: 5000ms
  maxRestarts?: number; // Default: 3
}

export interface WorkerPoolStats {
  activeWorkers: number;
  queueDepth: number;
  eventsProcessed: number;
  averageLatency: number;
  throughput: number; // events per second
  failedWorkers: number;
  restartedWorkers: number;
}

export interface WorkerMessage {
  type: 'EVENT' | 'HEALTH_CHECK' | 'SHUTDOWN' | 'STATS';
  data?: any;
  timestamp?: number;
}

export interface WorkerResponse {
  type: 'PROCESSED' | 'ERROR' | 'HEALTH_OK' | 'STATS';
  data?: any;
  workerId?: number;
  timestamp?: number;
  error?: string;
}

export interface WorkerStats {
  workerId: number;
  eventsProcessed: number;
  errors: number;
  averageProcessingTime: number;
  lastHealthCheck: number;
  isHealthy: boolean;
}

export interface RingBufferMetadata {
  head: number;
  tail: number;
  size: number;
  eventCount: number;
}

export interface EventQueueItem {
  event: DecodedEvent;
  timestamp: number;
  partition: number;
}

// Extended event type with metadata for worker processing
export interface ProcessableEvent {
  event: DecodedEvent;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
  address: string;
}
