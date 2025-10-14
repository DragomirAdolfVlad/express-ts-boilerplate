/**
 * Worker Pool Implementation
 * Manages a pool of worker threads for parallel event processing
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import path from 'path';
import { DecodedEvent } from '../binary-event-decoder';
import { ConsistentHash } from './consistent-hash';
import { RingBuffer } from './ring-buffer';
import {
  WorkerPoolConfig,
  WorkerPoolStats,
  WorkerMessage,
  WorkerResponse,
  WorkerStats
} from './types';

export class WorkerPool {
  private workers: Worker[] = [];
  private workerStats: Map<number, WorkerStats> = new Map();
  private consistentHash: ConsistentHash;
  private ringBuffers: Map<number, RingBuffer> = new Map();
  private config: Required<WorkerPoolConfig>;
  private healthCheckInterval?: NodeJS.Timeout;
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  private workerRestartCounts: Map<number, number> = new Map();

  // Performance tracking
  private totalEventsProcessed: number = 0;
  private totalErrors: number = 0;
  private startTime: number = 0;
  private latencySum: number = 0;
  private latencyCount: number = 0;

  constructor(config: WorkerPoolConfig = {}) {
    this.config = {
      workerCount: config.workerCount ?? cpus().length,
      queueSize: config.queueSize ?? 10000,
      healthCheckInterval: config.healthCheckInterval ?? 5000,
      maxRestarts: config.maxRestarts ?? 3
    };

    this.consistentHash = new ConsistentHash(this.config.workerCount);
  }

  /**
   * Initialize worker pool with N workers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Worker pool already initialized');
    }

    console.log(`Initializing worker pool with ${this.config.workerCount} workers...`);
    this.startTime = Date.now();

    // Create workers
    for (let i = 0; i < this.config.workerCount; i++) {
      await this.createWorker(i);
    }

    // Start health check interval
    this.startHealthChecks();

    this.isInitialized = true;
    console.log(`Worker pool initialized successfully`);
  }

  /**
   * Create a worker thread
   */
  private async createWorker(workerId: number): Promise<void> {
    // Support both compiled (.js) and ts-node (.ts) execution
    const workerPath = path.join(__dirname, 'event-worker.js');
    const workerPathTs = path.join(__dirname, 'event-worker.ts');
    
    // Check if compiled version exists, otherwise use TypeScript
    const fs = await import('fs');
    const finalPath = fs.existsSync(workerPath) ? workerPath : workerPathTs;
    
    const worker = new Worker(finalPath, {
      workerData: { workerId },
      // Enable ts-node for TypeScript files
      execArgv: finalPath.endsWith('.ts') ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'] : []
    });

    // Setup message handler
    worker.on('message', (response: WorkerResponse) => {
      this.handleWorkerResponse(workerId, response);
    });

    // Setup error handler
    worker.on('error', (error) => {
      console.error(`Worker ${workerId} error:`, error);
      this.totalErrors++;
      this.handleWorkerFailure(workerId);
    });

    // Setup exit handler
    worker.on('exit', (code) => {
      if (code !== 0 && !this.isShuttingDown) {
        console.error(`Worker ${workerId} exited with code ${code}`);
        this.handleWorkerFailure(workerId);
      }
    });

    this.workers[workerId] = worker;

    // Initialize worker stats
    this.workerStats.set(workerId, {
      workerId,
      eventsProcessed: 0,
      errors: 0,
      averageProcessingTime: 0,
      lastHealthCheck: Date.now(),
      isHealthy: true
    });

    // Create ring buffer for this worker
    this.ringBuffers.set(workerId, new RingBuffer(this.config.queueSize));

    console.log(`Worker ${workerId} created`);
  }

  /**
   * Handle worker failure and restart if needed
   */
  private async handleWorkerFailure(workerId: number): Promise<void> {
    const restartCount = this.workerRestartCounts.get(workerId) || 0;

    if (restartCount < this.config.maxRestarts) {
      console.log(`Restarting worker ${workerId} (attempt ${restartCount + 1}/${this.config.maxRestarts})`);
      
      // Clean up old worker
      const oldWorker = this.workers[workerId];
      if (oldWorker) {
        try {
          await oldWorker.terminate();
        } catch (error) {
          console.error(`Error terminating worker ${workerId}:`, error);
        }
      }

      // Create new worker
      await this.createWorker(workerId);
      this.workerRestartCounts.set(workerId, restartCount + 1);
    } else {
      console.error(`Worker ${workerId} exceeded max restart attempts, marking as failed`);
      const stats = this.workerStats.get(workerId);
      if (stats) {
        stats.isHealthy = false;
      }
    }
  }

  /**
   * Handle response from worker
   */
  private handleWorkerResponse(workerId: number, response: WorkerResponse): void {
    const stats = this.workerStats.get(workerId);
    if (!stats) return;

    switch (response.type) {
      case 'PROCESSED':
        stats.eventsProcessed++;
        this.totalEventsProcessed++;
        
        if (response.data?.processingTime) {
          this.latencySum += response.data.processingTime;
          this.latencyCount++;
        }
        break;

      case 'ERROR':
        stats.errors++;
        this.totalErrors++;
        console.error(`Worker ${workerId} error:`, response.error);
        break;

      case 'HEALTH_OK':
        stats.lastHealthCheck = Date.now();
        stats.isHealthy = true;
        break;

      case 'STATS':
        if (response.data) {
          stats.eventsProcessed = response.data.eventsProcessed || 0;
          stats.errors = response.data.errors || 0;
          stats.averageProcessingTime = response.data.averageProcessingTime || 0;
          stats.isHealthy = response.data.isHealthy ?? true;
        }
        break;
    }
  }

  /**
   * Submit event to worker pool
   */
  async submitEvent(event: DecodedEvent): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Worker pool not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    // Determine which worker should handle this event
    // Extract token address from the event based on event type
    const tokenAddress = event.token;
    const workerId = this.consistentHash.getWorker(tokenAddress);

    // Get worker and ring buffer
    const worker = this.workers[workerId];
    const ringBuffer = this.ringBuffers.get(workerId);

    if (!worker || !ringBuffer) {
      throw new Error(`Worker ${workerId} not available`);
    }

    // Check if worker is healthy
    const stats = this.workerStats.get(workerId);
    if (stats && !stats.isHealthy) {
      throw new Error(`Worker ${workerId} is unhealthy`);
    }

    // Try to push to ring buffer
    const success = ringBuffer.push(event);
    if (!success) {
      throw new Error(`Ring buffer full for worker ${workerId}`);
    }

    // Send event to worker
    const message: WorkerMessage = {
      type: 'EVENT',
      data: event,
      timestamp: Date.now()
    };

    worker.postMessage(message);
  }

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on all workers
   */
  private performHealthChecks(): void {
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      const stats = this.workerStats.get(i);

      if (worker && stats) {
        // Check if worker responded recently
        const timeSinceLastCheck = Date.now() - stats.lastHealthCheck;
        if (timeSinceLastCheck > this.config.healthCheckInterval * 2) {
          console.warn(`Worker ${i} hasn't responded to health check in ${timeSinceLastCheck}ms`);
          stats.isHealthy = false;
        }

        // Send health check message
        const message: WorkerMessage = {
          type: 'HEALTH_CHECK',
          timestamp: Date.now()
        };
        worker.postMessage(message);
      }
    }
  }

  /**
   * Get worker pool statistics
   */
  getStats(): WorkerPoolStats {
    const activeWorkers = Array.from(this.workerStats.values())
      .filter(s => s.isHealthy).length;

    const totalQueueDepth = Array.from(this.ringBuffers.values())
      .reduce((sum, buffer) => sum + buffer.getCount(), 0);

    const averageLatency = this.latencyCount > 0
      ? this.latencySum / this.latencyCount
      : 0;

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const throughput = elapsedSeconds > 0
      ? this.totalEventsProcessed / elapsedSeconds
      : 0;

    const failedWorkers = Array.from(this.workerStats.values())
      .filter(s => !s.isHealthy).length;

    const restartedWorkers = Array.from(this.workerRestartCounts.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      activeWorkers,
      queueDepth: totalQueueDepth,
      eventsProcessed: this.totalEventsProcessed,
      averageLatency,
      throughput,
      failedWorkers,
      restartedWorkers
    };
  }

  /**
   * Get individual worker statistics
   */
  getWorkerStats(): WorkerStats[] {
    return Array.from(this.workerStats.values());
  }

  /**
   * Gracefully shutdown all workers
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    console.log('Shutting down worker pool...');
    this.isShuttingDown = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Send shutdown message to all workers
    const shutdownPromises = this.workers.map(async (worker) => {
      if (worker) {
        const message: WorkerMessage = {
          type: 'SHUTDOWN',
          timestamp: Date.now()
        };
        worker.postMessage(message);

        // Wait for worker to exit gracefully (with timeout)
        return Promise.race([
          new Promise<void>(resolve => {
            worker.once('exit', () => resolve());
          }),
          new Promise<void>(resolve => setTimeout(resolve, 5000))
        ]).then(() => {
          return worker.terminate();
        });
      }
      return Promise.resolve();
    });

    await Promise.all(shutdownPromises);

    this.workers = [];
    this.workerStats.clear();
    this.ringBuffers.clear();
    this.isInitialized = false;

    console.log('Worker pool shutdown complete');
  }
}
