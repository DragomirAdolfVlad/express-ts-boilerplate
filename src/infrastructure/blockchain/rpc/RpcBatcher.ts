/**
 * RPC Request Batcher
 * 
 * Batches multiple RPC requests together for improved throughput
 * 
 * Requirement 11.2: Batch RPC requests with 100+ events per batch
 */

interface BatchConfig {
  enabled: boolean;
  maxBatchSize: number; // 100+
  maxWaitTime: number; // ms
}

interface BatchRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class RpcBatcher {
  private config: BatchConfig;
  private pendingRequests: Map<string, BatchRequest<any>>;
  private batchTimer: NodeJS.Timeout | null = null;
  private batchCount: number = 0;
  
  constructor(config: BatchConfig) {
    this.config = config;
    this.pendingRequests = new Map();
  }
  
  /**
   * Batch get blocks
   * Requirement 11.2: Batch RPC requests with 100+ events per batch
   */
  async batchGetBlocks(
    blockNumbers: number[],
    getBlock: (blockNumber: number) => Promise<any>
  ): Promise<any[]> {
    if (!this.config.enabled || blockNumbers.length === 0) {
      return Promise.all(blockNumbers.map(bn => getBlock(bn)));
    }
    
    // Split into batches of maxBatchSize
    const batches: number[][] = [];
    for (let i = 0; i < blockNumbers.length; i += this.config.maxBatchSize) {
      batches.push(blockNumbers.slice(i, i + this.config.maxBatchSize));
    }
    
    // Execute batches in parallel
    const results = await Promise.all(
      batches.map(batch => this.executeBatch(batch, getBlock))
    );
    
    // Flatten results
    return results.flat();
  }
  
  /**
   * Execute a batch of requests
   */
  private async executeBatch<T>(
    items: number[],
    executor: (item: number) => Promise<T>
  ): Promise<T[]> {
    this.batchCount++;
    
    // Execute all requests in parallel
    const promises = items.map(item => executor(item));
    
    try {
      return await Promise.all(promises);
    } catch (error) {
      console.error('Batch execution error:', error);
      throw error;
    }
  }
  
  /**
   * Add request to batch queue
   */
  async addToBatch<T>(
    id: string,
    execute: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enabled) {
      return execute();
    }
    
    return new Promise<T>((resolve, reject) => {
      const request: BatchRequest<T> = {
        id,
        execute,
        resolve,
        reject,
        timestamp: Date.now()
      };
      
      this.pendingRequests.set(id, request);
      
      // Schedule batch execution
      this.scheduleBatchExecution();
    });
  }
  
  /**
   * Schedule batch execution
   */
  private scheduleBatchExecution(): void {
    // If batch is full, execute immediately
    if (this.pendingRequests.size >= this.config.maxBatchSize) {
      this.executePendingBatch();
      return;
    }
    
    // Otherwise, schedule execution after maxWaitTime
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(
        () => this.executePendingBatch(),
        this.config.maxWaitTime
      );
    }
  }
  
  /**
   * Execute all pending requests in batch
   */
  private async executePendingBatch(): Promise<void> {
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Get all pending requests
    const requests = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();
    
    if (requests.length === 0) {
      return;
    }
    
    this.batchCount++;
    
    // Execute all requests in parallel
    const results = await Promise.allSettled(
      requests.map(req => req.execute())
    );
    
    // Resolve/reject promises
    results.forEach((result, index) => {
      const request = requests[index];
      
      if (!request) return;
      
      if (result.status === 'fulfilled') {
        request.resolve(result.value);
      } else {
        request.reject(result.reason);
      }
    });
  }
  
  /**
   * Get batch statistics
   */
  getStats(): {
    pendingRequests: number;
    totalBatches: number;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      totalBatches: this.batchCount
    };
  }
  
  /**
   * Flush all pending requests
   */
  async flush(): Promise<void> {
    await this.executePendingBatch();
  }
  
  /**
   * Shutdown batcher
   */
  async shutdown(): Promise<void> {
    // Execute any pending requests
    await this.executePendingBatch();
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }
}
