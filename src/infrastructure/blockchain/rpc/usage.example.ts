/**
 * Usage Examples for Optimized RPC Layer
 * 
 * Demonstrates how to use the optimized RPC layer in your application
 */

import { OptimizedRpcLayer } from './OptimizedRpcLayer';
import { productionRpcConfig } from './config.example';

/**
 * Example 1: Basic Setup and Initialization
 */
async function example1_BasicSetup() {
  // Create RPC layer instance
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  
  // Initialize (connects to endpoints, starts health checks)
  await rpcLayer.initialize();
  
  console.log('RPC Layer initialized');
  
  // Get current block
  const blockNumber = await rpcLayer.getBlock(12345);
  console.log('Block:', blockNumber);
  
  // Shutdown when done
  await rpcLayer.shutdown();
}

/**
 * Example 2: WebSocket Subscription for Real-Time Events
 * Requirement 11.1: Use WebSocket subscriptions instead of polling
 */
async function example2_WebSocketSubscription() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  // Subscribe to new blocks
  await rpcLayer.subscribeToBlocks((blockNumber) => {
    console.log('New block:', blockNumber);
  });
  
  // Subscribe to logs for specific contract
  await rpcLayer.subscribeToLogs(
    {
      address: '0x1234567890123456789012345678901234567890',
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']
    },
    (log) => {
      console.log('New log:', log);
    }
  );
}

/**
 * Example 3: Batch Requests for High Throughput
 * Requirement 11.2: Batch RPC requests with 100+ events per batch
 */
async function example3_BatchRequests() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  // Get multiple blocks in batch
  const blockNumbers = Array.from({ length: 200 }, (_, i) => 10000 + i);
  const blocks = await rpcLayer.getBlocksBatch(blockNumbers);
  
  console.log(`Fetched ${blocks.length} blocks in batch`);
  
  // Check cache hit rate
  const hitRate = rpcLayer.getCacheHitRate();
  console.log(`Cache hit rate: ${(hitRate * 100).toFixed(2)}%`);
}

/**
 * Example 4: Monitoring and Statistics
 * Requirement 11.7: RPC latency under 5ms at p95
 */
async function example4_Monitoring() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  // Listen to health check events
  rpcLayer.on('health-check', (endpointStats) => {
    console.log('Health check results:');
    for (const [url, stats] of endpointStats) {
      console.log(`  ${url}: ${stats.healthy ? '✅' : '❌'} (${stats.averageLatency.toFixed(2)}ms avg)`);
    }
  });
  
  // Get current statistics
  const stats = rpcLayer.getStats();
  console.log('RPC Statistics:', {
    totalRequests: stats.totalRequests,
    cacheHitRate: `${(stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(2)}%`,
    averageLatency: `${stats.averageLatency.toFixed(2)}ms`,
    failedRequests: stats.failedRequests
  });
}

/**
 * Example 5: Using Bloom Filter to Skip Blocks
 * Requirement 11.6: Use bloom filters to skip blocks with no relevant events
 */
async function example5_BloomFilter() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  // Get logs for a range of blocks
  // Bloom filter will automatically skip blocks with no relevant events
  const logs = await rpcLayer.getLogs({
    fromBlock: 10000,
    toBlock: 11000,
    address: '0x1234567890123456789012345678901234567890',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']
  });
  
  console.log(`Found ${logs.length} logs (bloom filter optimized)`);
}

/**
 * Example 6: Automatic Failover and Load Balancing
 * Requirements 11.4, 11.5: Load balancing and automatic failover
 */
async function example6_FailoverAndLoadBalancing() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  // Listen to endpoint failures
  rpcLayer.on('ws-error', (error) => {
    console.error('WebSocket error, will auto-reconnect:', error);
  });
  
  // Make requests - they will automatically be load balanced
  // and failover to healthy endpoints if one fails
  for (let i = 0; i < 100; i++) {
    try {
      const block = await rpcLayer.getBlock(10000 + i);
      console.log(`Block ${10000 + i}: ${block?.hash}`);
    } catch (error) {
      console.error(`Failed to get block ${10000 + i}:`, error);
    }
  }
  
  // Check which endpoints are healthy
  const stats = rpcLayer.getStats();
  console.log('\nEndpoint Health:');
  for (const [url, endpointStats] of stats.endpointStats) {
    console.log(`  ${url}: ${endpointStats.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`    Requests: ${endpointStats.requestCount}, Failures: ${endpointStats.failureCount}`);
    console.log(`    Avg Latency: ${endpointStats.averageLatency.toFixed(2)}ms`);
  }
}

/**
 * Example 7: Integration with Token Tracker
 */
async function example7_TokenTrackerIntegration() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  const contractAddress = '0x1234567890123456789012345678901234567890';
  const eventTopics = [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event
  ];
  
  // Subscribe to real-time events
  await rpcLayer.subscribeToLogs(
    { address: contractAddress, topics: eventTopics },
    async (log) => {
      console.log('New transfer event:', log);
      
      // Get transaction receipt with caching
      const receipt = await rpcLayer.getTransactionReceipt(log.transactionHash);
      console.log('Transaction receipt:', receipt);
    }
  );
  
  // Also fetch historical events in batches
  const historicalLogs = await rpcLayer.getLogs({
    fromBlock: 10000,
    toBlock: 11000,
    address: contractAddress,
    topics: eventTopics
  });
  
  console.log(`Found ${historicalLogs.length} historical events`);
}

/**
 * Example 8: Performance Benchmarking
 */
async function example8_PerformanceBenchmark() {
  const rpcLayer = new OptimizedRpcLayer(productionRpcConfig);
  await rpcLayer.initialize();
  
  console.log('Starting performance benchmark...');
  
  const startTime = process.hrtime.bigint();
  const blockCount = 1000;
  
  // Fetch 1000 blocks
  const blockNumbers = Array.from({ length: blockCount }, (_, i) => 10000 + i);
  await rpcLayer.getBlocksBatch(blockNumbers);
  
  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1_000_000;
  
  const stats = rpcLayer.getStats();
  
  console.log('\nBenchmark Results:');
  console.log(`  Blocks fetched: ${blockCount}`);
  console.log(`  Duration: ${durationMs.toFixed(2)}ms`);
  console.log(`  Throughput: ${(blockCount / (durationMs / 1000)).toFixed(2)} blocks/sec`);
  console.log(`  Average latency: ${stats.averageLatency.toFixed(2)}ms`);
  console.log(`  Cache hit rate: ${(rpcLayer.getCacheHitRate() * 100).toFixed(2)}%`);
  console.log(`  Failed requests: ${stats.failedRequests}`);
  
  await rpcLayer.shutdown();
}

// Export examples
export {
  example1_BasicSetup,
  example2_WebSocketSubscription,
  example3_BatchRequests,
  example4_Monitoring,
  example5_BloomFilter,
  example6_FailoverAndLoadBalancing,
  example7_TokenTrackerIntegration,
  example8_PerformanceBenchmark
};
