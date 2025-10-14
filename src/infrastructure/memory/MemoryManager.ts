/**
 * Zero-Copy Memory Manager with Object Pooling
 * 
 * Implements object pooling and buffer reuse to minimize GC pauses
 * and memory allocations at extreme scale (10,000+ tx/s).
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { performance } from 'perf_hooks';

/**
 * Trade data structure for object pooling
 * Matches the database schema for MonadTokenTrade
 */
export interface TradeData {
  tokenAddress: string;
  trader: string;
  isBuy: boolean;
  wmonAmount: number;
  tokenAmount: number;
  pricePerToken: number;
  blockNumber: string;
  blockHash: string;
  timestamp: Date;
  transactionHash: string;
  logIndex: number;
  usdAmount?: number;
  commitState?: string;
  curveProgress?: number;
  marketCap?: number;
  liquidityUsd?: number;
}

/**
 * Memory statistics for monitoring
 */
export interface MemoryStats {
  poolSize: number;
  activeObjects: number;
  bufferPoolSize: number;
  activeBuffers: number;
  gcPauses: number;
  averageGCPause: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  acquisitions: number;
  releases: number;
  bufferAcquisitions: number;
  bufferReleases: number;
}

/**
 * Buffer pool entry
 */
interface BufferPoolEntry {
  buffer: Buffer;
  size: number;
  inUse: boolean;
}

/**
 * MemoryManager class with object pooling and buffer reuse
 * 
 * Features:
 * - Pre-allocated object pool (10,000 TradeData objects)
 * - Buffer pool for reusable buffers
 * - Lock-free acquisition/release using arrays
 * - Memory statistics tracking
 * - GC monitoring
 */
export class MemoryManager {
  private static instance: MemoryManager;
  
  // Object pool for TradeData
  private tradePool: TradeData[] = [];
  private availableTrades: number[] = [];
  private poolSize: number;
  
  // Buffer pool
  private bufferPool: Map<number, BufferPoolEntry[]> = new Map();
  private readonly BUFFER_SIZES = [256, 1024, 4096, 16384, 65536]; // Common sizes
  private readonly BUFFERS_PER_SIZE = 100;
  
  // Statistics
  private stats = {
    acquisitions: 0,
    releases: 0,
    bufferAcquisitions: 0,
    bufferReleases: 0,
    gcPauses: 0,
    totalGCPause: 0,
  };
  
  // GC monitoring
  private gcObserver: any = null;
  
  private constructor(poolSize: number = 10000) {
    this.poolSize = poolSize;
    this.initializeTradePool();
    this.initializeBufferPool();
    this.setupGCMonitoring();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(poolSize?: number): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager(poolSize);
    }
    return MemoryManager.instance;
  }
  
  /**
   * Initialize trade object pool
   * Pre-allocates 10,000 TradeData objects at startup
   */
  private initializeTradePool(): void {
    console.log(`[MemoryManager] Initializing trade pool with ${this.poolSize} objects...`);
    const startTime = performance.now();
    
    for (let i = 0; i < this.poolSize; i++) {
      const trade: TradeData = {
        tokenAddress: '',
        trader: '',
        isBuy: false,
        wmonAmount: 0,
        tokenAmount: 0,
        pricePerToken: 0,
        blockNumber: '',
        blockHash: '',
        timestamp: new Date(0),
        transactionHash: '',
        logIndex: 0,
      };
      
      this.tradePool.push(trade);
      this.availableTrades.push(i);
    }
    
    const duration = performance.now() - startTime;
    console.log(`[MemoryManager] Trade pool initialized in ${duration.toFixed(2)}ms`);
  }
  
  /**
   * Initialize buffer pool
   * Pre-allocates buffers of common sizes
   */
  private initializeBufferPool(): void {
    console.log('[MemoryManager] Initializing buffer pool...');
    const startTime = performance.now();
    
    for (const size of this.BUFFER_SIZES) {
      const buffers: BufferPoolEntry[] = [];
      
      for (let i = 0; i < this.BUFFERS_PER_SIZE; i++) {
        buffers.push({
          buffer: Buffer.allocUnsafe(size),
          size,
          inUse: false,
        });
      }
      
      this.bufferPool.set(size, buffers);
    }
    
    const duration = performance.now() - startTime;
    console.log(`[MemoryManager] Buffer pool initialized in ${duration.toFixed(2)}ms`);
  }
  
  /**
   * Setup GC monitoring using PerformanceObserver
   */
  private setupGCMonitoring(): void {
    try {
      // Monitor GC events
      const { PerformanceObserver } = require('perf_hooks');
      this.gcObserver = new PerformanceObserver((list: any) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.stats.gcPauses++;
            this.stats.totalGCPause += entry.duration;
          }
        }
      });
      
      this.gcObserver.observe({ entryTypes: ['gc'] });
      console.log('[MemoryManager] GC monitoring enabled');
    } catch (error) {
      console.warn('[MemoryManager] GC monitoring not available:', error);
    }
  }
  
  /**
   * Acquire a trade object from the pool
   * Returns a pre-allocated TradeData object
   */
  public acquireTrade(): TradeData {
    this.stats.acquisitions++;
    
    const index = this.availableTrades.pop();
    
    if (index === undefined) {
      // Pool exhausted - create new object (should be rare)
      console.warn('[MemoryManager] Trade pool exhausted, creating new object');
      return {
        tokenAddress: '',
        trader: '',
        isBuy: false,
        wmonAmount: 0,
        tokenAmount: 0,
        pricePerToken: 0,
        blockNumber: '',
        blockHash: '',
        timestamp: new Date(0),
        transactionHash: '',
        logIndex: 0,
      };
    }
    
    // Return pooled object (already allocated)
    const trade = this.tradePool[index];
    if (!trade) {
      throw new Error(`Invalid pool index: ${index}`);
    }
    return trade;
  }
  
  /**
   * Release a trade object back to the pool
   * Clears the object data and returns it to available pool
   */
  public releaseTrade(trade: TradeData): void {
    this.stats.releases++;
    
    // Find the index of this trade in the pool
    const index = this.tradePool.indexOf(trade);
    
    if (index === -1) {
      // Not from pool (was created due to exhaustion)
      return;
    }
    
    // Clear the trade data (reuse object)
    trade.tokenAddress = '';
    trade.trader = '';
    trade.isBuy = false;
    trade.wmonAmount = 0;
    trade.tokenAmount = 0;
    trade.pricePerToken = 0;
    trade.blockNumber = '';
    trade.blockHash = '';
    trade.timestamp = new Date(0);
    trade.transactionHash = '';
    trade.logIndex = 0;
    trade.usdAmount = undefined;
    trade.commitState = undefined;
    trade.curveProgress = undefined;
    trade.marketCap = undefined;
    trade.liquidityUsd = undefined;
    
    // Return to available pool
    this.availableTrades.push(index);
  }
  
  /**
   * Acquire a buffer from the pool
   * Returns a pre-allocated buffer of the requested size (or larger)
   */
  public acquireBuffer(size: number): Buffer {
    this.stats.bufferAcquisitions++;
    
    // Find the smallest buffer size that fits
    let targetSize: number = this.BUFFER_SIZES[0]!;
    for (const bufferSize of this.BUFFER_SIZES) {
      if (bufferSize >= size) {
        targetSize = bufferSize;
        break;
      }
    }
    
    // If size is larger than all pool sizes, allocate new
    const largestSize = this.BUFFER_SIZES[this.BUFFER_SIZES.length - 1];
    if (largestSize && size > largestSize) {
      return Buffer.allocUnsafe(size);
    }
    
    const pool = this.bufferPool.get(targetSize);
    
    if (!pool) {
      // Size not in pool - allocate new buffer
      return Buffer.allocUnsafe(size);
    }
    
    // Find available buffer
    for (const entry of pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        return entry.buffer;
      }
    }
    
    // Pool exhausted - allocate new buffer
    console.warn(`[MemoryManager] Buffer pool exhausted for size ${targetSize}`);
    return Buffer.allocUnsafe(size);
  }
  
  /**
   * Release a buffer back to the pool
   */
  public releaseBuffer(buffer: Buffer): void {
    this.stats.bufferReleases++;
    
    const size = buffer.length;
    const pool = this.bufferPool.get(size);
    
    if (!pool) {
      // Not from pool
      return;
    }
    
    // Find this buffer in the pool
    for (const entry of pool) {
      if (entry.buffer === buffer) {
        entry.inUse = false;
        return;
      }
    }
  }
  
  /**
   * Get memory statistics
   */
  public getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    
    // Count active objects
    const activeObjects = this.poolSize - this.availableTrades.length;
    
    // Count active buffers
    let activeBuffers = 0;
    for (const pool of this.bufferPool.values()) {
      activeBuffers += pool.filter(entry => entry.inUse).length;
    }
    
    // Calculate total buffer pool size
    let bufferPoolSize = 0;
    for (const pool of this.bufferPool.values()) {
      bufferPoolSize += pool.length;
    }
    
    return {
      poolSize: this.poolSize,
      activeObjects,
      bufferPoolSize,
      activeBuffers,
      gcPauses: this.stats.gcPauses,
      averageGCPause: this.stats.gcPauses > 0 
        ? this.stats.totalGCPause / this.stats.gcPauses 
        : 0,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      acquisitions: this.stats.acquisitions,
      releases: this.stats.releases,
      bufferAcquisitions: this.stats.bufferAcquisitions,
      bufferReleases: this.stats.bufferReleases,
    };
  }
  
  /**
   * Reset statistics (for testing)
   */
  public resetStats(): void {
    this.stats = {
      acquisitions: 0,
      releases: 0,
      bufferAcquisitions: 0,
      bufferReleases: 0,
      gcPauses: 0,
      totalGCPause: 0,
    };
  }
  
  /**
   * Cleanup and shutdown
   */
  public shutdown(): void {
    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = null;
    }
    
    console.log('[MemoryManager] Shutdown complete');
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();
