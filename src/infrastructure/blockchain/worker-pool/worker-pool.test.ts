/**
 * Worker Pool Tests
 * Tests for the high-performance worker thread pool
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkerPool } from './worker-pool';
import { ConsistentHash } from './consistent-hash';
import { RingBuffer } from './ring-buffer';
import { CurveBuyEvent } from '../binary-event-decoder';

describe('ConsistentHash', () => {
  it('should distribute events consistently', () => {
    const hash = new ConsistentHash(4);
    const tokenAddress = '0x1234567890123456789012345678901234567890';

    // Same token should always go to same worker
    const worker1 = hash.getWorker(tokenAddress);
    const worker2 = hash.getWorker(tokenAddress);
    const worker3 = hash.getWorker(tokenAddress);

    expect(worker1).toBe(worker2);
    expect(worker2).toBe(worker3);
    expect(worker1).toBeGreaterThanOrEqual(0);
    expect(worker1).toBeLessThan(4);
  });

  it('should distribute different tokens across workers', () => {
    const hash = new ConsistentHash(4);
    const tokens = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555',
      '0x6666666666666666666666666666666666666666',
      '0x7777777777777777777777777777777777777777',
      '0x8888888888888888888888888888888888888888'
    ];

    const distribution = hash.getDistribution(tokens);
    
    // Should use all workers
    expect(distribution.size).toBe(4);
    
    // Each worker should get at least one token
    for (let i = 0; i < 4; i++) {
      expect(distribution.get(i)).toBeGreaterThan(0);
    }
  });

  it('should handle worker count updates', () => {
    const hash = new ConsistentHash(2);
    const tokenAddress = '0x1234567890123456789012345678901234567890';

    const worker1 = hash.getWorker(tokenAddress);
    expect(worker1).toBeGreaterThanOrEqual(0);
    expect(worker1).toBeLessThan(2);

    hash.updateWorkerCount(4);
    const worker2 = hash.getWorker(tokenAddress);
    expect(worker2).toBeGreaterThanOrEqual(0);
    expect(worker2).toBeLessThan(4);
  });

  it('should throw error for zero workers', () => {
    expect(() => new ConsistentHash(0)).toThrow();
  });
});

describe('RingBuffer', () => {
  let buffer: RingBuffer;

  beforeEach(() => {
    buffer = new RingBuffer(10);
  });

  it('should push and pop events', () => {
    const event: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0xsender',
      token: '0xtoken',
      amountIn: BigInt(1000),
      amountOut: BigInt(2000)
    };

    const success = buffer.push(event);
    expect(success).toBe(true);
    expect(buffer.getCount()).toBe(1);

    const popped = buffer.pop();
    expect(popped).toBeDefined();
    expect(popped?.name).toBe('CurveBuy');
    if (popped?.name === 'CurveBuy') {
      expect(popped.sender).toBe('0xsender');
    }
    expect(buffer.getCount()).toBe(0);
  });

  it('should handle buffer full condition', () => {
    const event: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0x1',
      token: '0x1',
      amountIn: BigInt(100),
      amountOut: BigInt(200)
    };

    // Fill buffer
    for (let i = 0; i < 10; i++) {
      const success = buffer.push(event);
      expect(success).toBe(true);
    }

    expect(buffer.isFull()).toBe(true);

    // Try to push when full
    const success = buffer.push(event);
    expect(success).toBe(false);
  });

  it('should handle buffer empty condition', () => {
    expect(buffer.isEmpty()).toBe(true);
    
    const popped = buffer.pop();
    expect(popped).toBeNull();
  });

  it('should maintain FIFO order', () => {
    const events: CurveBuyEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push({
        name: 'CurveBuy',
        sender: `0xsender${i}`,
        token: `0xtoken${i}`,
        amountIn: BigInt(i * 100),
        amountOut: BigInt(i * 200)
      });
      buffer.push(events[i]!);
    }

    for (let i = 0; i < 5; i++) {
      const popped = buffer.pop();
      if (popped?.name === 'CurveBuy') {
        expect(popped.sender).toBe(`0xsender${i}`);
      }
    }
  });

  it('should handle wrap-around', () => {
    const event: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0x1',
      token: '0x1',
      amountIn: BigInt(100),
      amountOut: BigInt(200)
    };

    // Fill and empty buffer multiple times
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 10; i++) {
        buffer.push(event);
      }
      for (let i = 0; i < 10; i++) {
        buffer.pop();
      }
    }

    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.getCount()).toBe(0);
  });
});

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(async () => {
    pool = new WorkerPool({ workerCount: 2, queueSize: 100 });
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  it('should initialize with correct number of workers', async () => {
    await pool.initialize();
    
    const stats = pool.getStats();
    expect(stats.activeWorkers).toBe(2);
  });

  it('should throw error if initialized twice', async () => {
    await pool.initialize();
    await expect(pool.initialize()).rejects.toThrow('already initialized');
  });

  it('should submit events to workers', async () => {
    await pool.initialize();

    const event: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0xsender',
      token: '0x1234567890123456789012345678901234567890',
      amountIn: BigInt(1000),
      amountOut: BigInt(2000)
    };

    await pool.submitEvent(event);

    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = pool.getStats();
    expect(stats.eventsProcessed).toBeGreaterThan(0);
  });

  it('should throw error when submitting before initialization', async () => {
    const event: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0x1',
      token: '0x1',
      amountIn: BigInt(100),
      amountOut: BigInt(200)
    };

    await expect(pool.submitEvent(event)).rejects.toThrow('not initialized');
  });

  it('should track statistics correctly', async () => {
    await pool.initialize();

    const stats = pool.getStats();
    expect(stats).toHaveProperty('activeWorkers');
    expect(stats).toHaveProperty('queueDepth');
    expect(stats).toHaveProperty('eventsProcessed');
    expect(stats).toHaveProperty('averageLatency');
    expect(stats).toHaveProperty('throughput');
    expect(stats).toHaveProperty('failedWorkers');
    expect(stats).toHaveProperty('restartedWorkers');
  });

  it('should get individual worker stats', async () => {
    await pool.initialize();

    const workerStats = pool.getWorkerStats();
    expect(workerStats).toHaveLength(2);
    
    for (const stats of workerStats) {
      expect(stats).toHaveProperty('workerId');
      expect(stats).toHaveProperty('eventsProcessed');
      expect(stats).toHaveProperty('errors');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('lastHealthCheck');
      expect(stats).toHaveProperty('isHealthy');
    }
  });

  it('should shutdown gracefully', async () => {
    await pool.initialize();
    await pool.shutdown();

    const stats = pool.getStats();
    expect(stats.activeWorkers).toBe(0);
  });
});
