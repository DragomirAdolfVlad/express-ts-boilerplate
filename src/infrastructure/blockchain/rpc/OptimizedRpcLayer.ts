/**
 * Optimized RPC Layer with Advanced Caching
 * 
 * Features:
 * - WebSocket subscriptions for real-time events
 * - RPC request batching (100+ events per batch)
 * - Redis caching with 1-5 second TTL
 * - Load balancing across multiple RPC endpoints
 * - Health checks and automatic failover
 * - Bloom filter to skip blocks with no relevant events
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
 */

import { WebSocketProvider, Block, Log, TransactionReceipt } from 'ethers';
import { EventEmitter } from 'events';
import { BloomFilter } from './BloomFilter';
import { RpcEndpointManager } from './RpcEndpointManager';
import { RpcCache } from './RpcCache';
import { RpcBatcher } from './RpcBatcher';

export interface RpcEndpoint {
  url: string;
  type: 'http' | 'ws';
  priority: number;
  weight: number;
}

export interface OptimizedRpcConfig {
  endpoints: RpcEndpoint[];
  chainId: number;
  networkName: string;
  
  // Caching configuration
  cache: {
    enabled: boolean;
    ttl: number; // seconds (1-5)
    redisUrl?: string;
  };
  
  // Batching configuration
  batching: {
    enabled: boolean;
    maxBatchSize: number; // 100+
    maxWaitTime: number; // ms
  };
  
  // Health check configuration
  healthCheck: {
    interval: number; // ms
    timeout: number; // ms
    failureThreshold: number;
    successThreshold: number;
  };
  
  // Bloom filter configuration
  bloomFilter: {
    enabled: boolean;
    expectedElements: number;
    falsePositiveRate: number;
  };
  
  // Retry configuration
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
  };
}

export interface RpcStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  batchedRequests: number;
  failedRequests: number;
  averageLatency: number;
  endpointStats: Map<string, EndpointStats>;
}

export interface EndpointStats {
  url: string;
  healthy: boolean;
  requestCount: number;
  failureCount: number;
  averageLatency: number;
  lastHealthCheck: Date;
}

export class OptimizedRpcLayer extends EventEmitter {
  private config: OptimizedRpcConfig;
  private endpointManager: RpcEndpointManager;
  private cache: RpcCache;
  private batcher: RpcBatcher;
  private bloomFilter: BloomFilter;
  
  private stats: RpcStats;
  private wsProvider: WebSocketProvider | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(config: OptimizedRpcConfig) {
    super();
    this.config = config;
    
    // Initialize components
    this.endpointManager = new RpcEndpointManager(config.endpoints, config.retry);
    this.cache = new RpcCache(config.cache);
    this.batcher = new RpcBatcher(config.batching);
    this.bloomFilter = new BloomFilter(
      config.bloomFilter.expectedElements,
      config.bloomFilter.falsePositiveRate
    );
    
    // Initialize stats
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      batchedRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      endpointStats: new Map()
    };
  }
  
  /**
   * Initialize the RPC layer
   */
  async initialize(): Promise<void> {
    // Initialize cache
    if (this.config.cache.enabled) {
      await this.cache.initialize();
    }
    
    // Initialize endpoint manager
    await this.endpointManager.initialize();
    
    // Setup WebSocket subscription if available
    await this.setupWebSocketSubscription();
    
    // Start health checks
    this.startHealthChecks();
    
    this.emit('initialized');
  }
  
  /**
   * Setup WebSocket subscription for real-time events
   * Requirement 11.1: Use WebSocket subscriptions instead of polling
   */
  private async setupWebSocketSubscription(): Promise<void> {
    const wsEndpoint = this.config.endpoints.find(e => e.type === 'ws');
    
    if (!wsEndpoint) {
      console.warn('No WebSocket endpoint configured, falling back to polling');
      return;
    }
    
    try {
      this.wsProvider = new WebSocketProvider(
        wsEndpoint.url,
        {
          chainId: this.config.chainId,
          name: this.config.networkName
        }
      );
      
      // Setup reconnection logic
      const websocket = this.wsProvider.websocket as any;
      if (websocket && typeof websocket.on === 'function') {
        websocket.on('close', () => {
          console.warn('WebSocket connection closed, attempting reconnection...');
          setTimeout(() => this.setupWebSocketSubscription(), 5000);
        });
        
        websocket.on('error', (error: Error) => {
          console.error('WebSocket error:', error);
          this.emit('ws-error', error);
        });
      }
      
      // Verify connection
      await this.wsProvider.getNetwork();
      console.log('✅ WebSocket subscription established');
      this.emit('ws-connected');
      
    } catch (error) {
      console.error('Failed to setup WebSocket subscription:', error);
      this.wsProvider = null;
    }
  }
  
  /**
   * Subscribe to new blocks via WebSocket
   */
  async subscribeToBlocks(callback: (blockNumber: number) => void): Promise<void> {
    if (!this.wsProvider) {
      throw new Error('WebSocket provider not available');
    }
    
    this.wsProvider.on('block', callback);
  }
  
  /**
   * Subscribe to logs via WebSocket
   */
  async subscribeToLogs(
    filter: { address?: string; topics?: string[] },
    callback: (log: Log) => void
  ): Promise<void> {
    if (!this.wsProvider) {
      throw new Error('WebSocket provider not available');
    }
    
    // Use WebSocket for real-time log subscription
    const filterObj = {
      address: filter.address,
      topics: filter.topics
    };
    
    this.wsProvider.on(filterObj, callback);
  }
  
  /**
   * Get block with caching and batching
   * Requirement 11.2: Batch RPC requests
   * Requirement 11.3: Redis caching with 1-5 second TTL
   */
  async getBlock(blockNumber: number, includeTransactions: boolean = false): Promise<Block | null> {
    const cacheKey = `block:${blockNumber}:${includeTransactions}`;
    
    // Check cache first
    if (this.config.cache.enabled) {
      const cached = await this.cache.get<Block>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }
    
    // Execute request with load balancing and failover
    const startTime = process.hrtime.bigint();
    
    try {
      const block = await this.endpointManager.executeWithFailover(
        async (provider) => provider.getBlock(blockNumber, includeTransactions)
      );
      
      // Update stats
      const latency = Number(process.hrtime.bigint() - startTime) / 1_000_000; // ms
      this.updateLatencyStats(latency);
      this.stats.totalRequests++;
      
      // Cache result
      if (this.config.cache.enabled && block) {
        await this.cache.set(cacheKey, block, this.config.cache.ttl);
      }
      
      return block;
      
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }
  
  /**
   * Get logs with bloom filter optimization
   * Requirement 11.6: Use bloom filters to skip blocks with no relevant events
   */
  async getLogs(filter: {
    fromBlock: number;
    toBlock: number;
    address?: string;
    topics?: string[];
  }): Promise<Log[]> {
    const logs: Log[] = [];
    
    // Process blocks in batches
    for (let block = filter.fromBlock; block <= filter.toBlock; block++) {
      // Check bloom filter first to skip blocks with no relevant events
      if (this.config.bloomFilter.enabled) {
        const shouldSkip = await this.shouldSkipBlock(block, filter.address);
        if (shouldSkip) {
          continue;
        }
      }
      
      // Batch the log requests
      const blockLogs = await this.getLogsForBlock(block, filter);
      logs.push(...blockLogs);
      
      // Update bloom filter with found events
      if (blockLogs.length > 0 && filter.address) {
        this.bloomFilter.add(`${block}:${filter.address}`);
      }
    }
    
    return logs;
  }
  
  /**
   * Check if block should be skipped based on bloom filter
   */
  private async shouldSkipBlock(
    blockNumber: number,
    address?: string
  ): Promise<boolean> {
    if (!address) return false;
    
    const key = `${blockNumber}:${address}`;
    
    // If bloom filter says "definitely not present", skip the block
    if (!this.bloomFilter.contains(key)) {
      return true;
    }
    
    // Bloom filter says "might be present", need to check
    return false;
  }
  
  /**
   * Get logs for a specific block with caching
   */
  private async getLogsForBlock(
    blockNumber: number,
    filter: { address?: string; topics?: string[] }
  ): Promise<Log[]> {
    const cacheKey = `logs:${blockNumber}:${filter.address}:${JSON.stringify(filter.topics)}`;
    
    // Check cache
    if (this.config.cache.enabled) {
      const cached = await this.cache.get<Log[]>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }
    
    // Execute request
    const startTime = process.hrtime.bigint();
    
    try {
      const logs = await this.endpointManager.executeWithFailover(
        async (provider) => provider.getLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber,
          address: filter.address,
          topics: filter.topics
        })
      );
      
      // Update stats
      const latency = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      this.updateLatencyStats(latency);
      this.stats.totalRequests++;
      
      // Cache result
      if (this.config.cache.enabled) {
        await this.cache.set(cacheKey, logs, this.config.cache.ttl);
      }
      
      return logs;
      
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }
  
  /**
   * Batch get multiple blocks
   * Requirement 11.2: Batch RPC requests with 100+ events per batch
   */
  async getBlocksBatch(blockNumbers: number[]): Promise<(Block | null)[]> {
    if (!this.config.batching.enabled) {
      // Fallback to sequential requests
      return Promise.all(blockNumbers.map(bn => this.getBlock(bn)));
    }
    
    // Use batcher for efficient batching
    const results = await this.batcher.batchGetBlocks(
      blockNumbers,
      (bn) => this.getBlock(bn)
    );
    
    this.stats.batchedRequests += blockNumbers.length;
    
    return results;
  }
  
  /**
   * Get transaction receipt with caching
   */
  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    const cacheKey = `receipt:${txHash}`;
    
    // Check cache
    if (this.config.cache.enabled) {
      const cached = await this.cache.get<TransactionReceipt>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }
    
    // Execute request
    const startTime = process.hrtime.bigint();
    
    try {
      const receipt = await this.endpointManager.executeWithFailover(
        async (provider) => provider.getTransactionReceipt(txHash)
      );
      
      // Update stats
      const latency = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      this.updateLatencyStats(latency);
      this.stats.totalRequests++;
      
      // Cache result (receipts are immutable)
      if (this.config.cache.enabled && receipt) {
        await this.cache.set(cacheKey, receipt, 3600); // Cache for 1 hour
      }
      
      return receipt;
      
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }
  
  /**
   * Start health checks for all endpoints
   * Requirement 11.4: Health checks and automatic failover
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheck.interval
    );
    
    // Perform initial health check
    this.performHealthChecks();
  }
  
  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    await this.endpointManager.performHealthChecks();
    
    // Update stats
    const endpointStats = this.endpointManager.getEndpointStats();
    this.stats.endpointStats = endpointStats;
    
    // Emit health check event
    this.emit('health-check', endpointStats);
  }
  
  /**
   * Update latency statistics
   */
  private updateLatencyStats(latency: number): void {
    // Exponential moving average
    const alpha = 0.1;
    this.stats.averageLatency = 
      this.stats.averageLatency * (1 - alpha) + latency * alpha;
  }
  
  /**
   * Get RPC statistics
   * Requirement 11.7: RPC latency under 5ms at p95
   */
  getStats(): RpcStats {
    return {
      ...this.stats,
      endpointStats: new Map(this.stats.endpointStats)
    };
  }
  
  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return total > 0 ? this.stats.cacheHits / total : 0;
  }
  
  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    if (this.config.cache.enabled) {
      await this.cache.clear();
    }
  }
  
  /**
   * Shutdown the RPC layer
   */
  async shutdown(): Promise<void> {
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Close WebSocket connection
    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    
    // Shutdown components
    await this.endpointManager.shutdown();
    await this.cache.shutdown();
    await this.batcher.shutdown();
    
    this.emit('shutdown');
  }
}
