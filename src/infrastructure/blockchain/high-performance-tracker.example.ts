/**
 * High-Performance Tracker Usage Example
 * 
 * Demonstrates how to use the integrated high-performance tracker
 * with all optimized components.
 */

import { HighPerformanceTracker } from './high-performance-tracker';
import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

/**
 * Example 1: Basic Setup with HTTP Provider
 */
async function basicExample() {
  console.log('=== Example 1: Basic Setup ===\n');
  
  // Initialize provider and database
  const provider = new JsonRpcProvider(process.env['MONAD_RPC_URL'] || 'https://rpc.monad.network');
  const prisma = new PrismaClient();
  
  // Create high-performance tracker with default settings
  const tracker = new HighPerformanceTracker(provider, prisma, {
    databaseUrl: process.env['DATABASE_URL']!,
    workerCount: 8,               // 8 worker threads
    batchSize: 1000,              // 1000 trades per batch
    flushIntervalMs: 50,          // Flush every 50ms
    objectPoolSize: 10000,        // 10,000 pre-allocated objects
    enableCircuitBreaker: true,   // Enable fault tolerance
    enableMonitoring: true,       // Enable performance monitoring
    samplingRate: 100             // Sample 1 in 100 for low overhead
  });
  
  // Start tracking
  await tracker.start();
  
  console.log('✅ Tracker started successfully\n');
  
  // Monitor for 60 seconds
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  // Get statistics
  const stats = tracker.getStats();
  console.log('\n📊 Final Statistics:');
  console.log('Performance:', JSON.stringify(stats.performance, null, 2));
  console.log('Workers:', JSON.stringify(stats.workers, null, 2));
  console.log('Batch Writer:', JSON.stringify(stats.batchWriter, null, 2));
  console.log('Memory:', JSON.stringify(stats.memory, null, 2));
  
  // Graceful shutdown
  await tracker.shutdown();
  await prisma.$disconnect();
  
  console.log('\n✅ Example 1 complete\n');
}

/**
 * Example 2: High-Throughput Configuration
 */
async function highThroughputExample() {
  console.log('=== Example 2: High-Throughput Configuration ===\n');
  
  const provider = new JsonRpcProvider(process.env['MONAD_RPC_URL']!);
  const prisma = new PrismaClient();
  
  // Optimize for maximum throughput
  const tracker = new HighPerformanceTracker(provider, prisma, {
    databaseUrl: process.env['DATABASE_URL']!,
    workerCount: 32,              // Max parallelism (32-core CPU)
    batchSize: 1000,              // Large batches
    flushIntervalMs: 50,          // Aggressive flushing
    objectPoolSize: 20000,        // Large pool for burst traffic
    enableCircuitBreaker: true,
    enableMonitoring: true,
    samplingRate: 100
  });
  
  await tracker.start();
  
  console.log('✅ High-throughput tracker started\n');
  console.log('Configuration:');
  console.log('  - 32 worker threads');
  console.log('  - 1000 trades per batch');
  console.log('  - 50ms flush interval');
  console.log('  - 20,000 object pool size');
  console.log('  - Target: 10,000+ tx/s\n');
  
  // Monitor for 5 minutes
  await new Promise(resolve => setTimeout(resolve, 300000));
  
  await tracker.shutdown();
  await prisma.$disconnect();
  
  console.log('\n✅ Example 2 complete\n');
}

/**
 * Example 3: Low-Latency Configuration
 */
async function lowLatencyExample() {
  console.log('=== Example 3: Low-Latency Configuration ===\n');
  
  const provider = new WebSocketProvider(process.env['MONAD_WS_URL'] || 'wss://ws.monad.network');
  const prisma = new PrismaClient();
  
  // Optimize for minimum latency
  const tracker = new HighPerformanceTracker(provider, prisma, {
    databaseUrl: process.env['DATABASE_URL']!,
    workerCount: 16,              // Balanced parallelism
    batchSize: 500,               // Smaller batches for faster flushing
    flushIntervalMs: 25,          // Very aggressive flushing
    objectPoolSize: 10000,
    enableCircuitBreaker: true,
    enableMonitoring: true,
    samplingRate: 50              // More frequent sampling for better latency tracking
  });
  
  await tracker.start();
  
  console.log('✅ Low-latency tracker started\n');
  console.log('Configuration:');
  console.log('  - WebSocket provider for real-time events');
  console.log('  - 500 trades per batch');
  console.log('  - 25ms flush interval');
  console.log('  - Target: < 10ms p95 latency\n');
  
  // Monitor for 2 minutes
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  const stats = tracker.getStats();
  console.log('\n📊 Latency Statistics:');
  console.log(`  - Event Decode p95: ${stats.performance.latency.event_decode?.p95.toFixed(2)}ms`);
  console.log(`  - Worker Processing p95: ${stats.performance.latency.worker_processing?.p95.toFixed(2)}ms`);
  console.log(`  - End-to-End p95: ${stats.performance.latency.end_to_end?.p95.toFixed(2)}ms`);
  
  await tracker.shutdown();
  await prisma.$disconnect();
  
  console.log('\n✅ Example 3 complete\n');
}

/**
 * Example 4: Production Setup with Monitoring
 */
async function productionExample() {
  console.log('=== Example 4: Production Setup ===\n');
  
  const provider = new JsonRpcProvider(process.env['MONAD_RPC_URL']!);
  const prisma = new PrismaClient();
  
  // Production-ready configuration
  const tracker = new HighPerformanceTracker(provider, prisma, {
    databaseUrl: process.env['DATABASE_URL']!,
    workerCount: parseInt(process.env['WORKER_COUNT'] || '16'),
    batchSize: parseInt(process.env['BATCH_SIZE'] || '1000'),
    flushIntervalMs: parseInt(process.env['FLUSH_INTERVAL_MS'] || '50'),
    objectPoolSize: parseInt(process.env['OBJECT_POOL_SIZE'] || '10000'),
    enableCircuitBreaker: process.env['ENABLE_CIRCUIT_BREAKER'] !== 'false',
    enableMonitoring: process.env['ENABLE_MONITORING'] !== 'false',
    samplingRate: parseInt(process.env['SAMPLING_RATE'] || '100')
  });
  
  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await tracker.shutdown();
    await prisma.$disconnect();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await tracker.shutdown();
    await prisma.$disconnect();
    process.exit(0);
  });
  
  // Start tracker
  await tracker.start();
  
  console.log('✅ Production tracker started\n');
  
  // Periodic health checks
  setInterval(() => {
    const stats = tracker.getStats();
    
    // Check circuit breaker states
    if (stats.circuitBreakers.database.state === 'OPEN') {
      console.error('🚨 ALERT: Database circuit breaker OPEN!');
      // Send alert to operations team
    }
    
    if (stats.circuitBreakers.rpc.state === 'OPEN') {
      console.error('🚨 ALERT: RPC circuit breaker OPEN!');
      // Switch to backup RPC endpoint
    }
    
    // Check memory usage
    const memoryUsageMB = stats.memory.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 3500) {
      console.warn(`⚠️  WARNING: High memory usage: ${memoryUsageMB.toFixed(2)} MB`);
      // Trigger memory cleanup
    }
    
    // Check throughput
    if (stats.performance.eventsPerSecond < 1000) {
      console.warn(`⚠️  WARNING: Low throughput: ${stats.performance.eventsPerSecond.toFixed(2)} events/s`);
      // Investigate performance issues
    }
    
  }, 60000); // Every minute
  
  // Keep running
  await new Promise(() => {}); // Run forever
}

/**
 * Example 5: Statistics and Monitoring
 */
async function monitoringExample() {
  console.log('=== Example 5: Statistics and Monitoring ===\n');
  
  const provider = new JsonRpcProvider(process.env['MONAD_RPC_URL']!);
  const prisma = new PrismaClient();
  
  const tracker = new HighPerformanceTracker(provider, prisma, {
    databaseUrl: process.env['DATABASE_URL']!,
    workerCount: 16,
    batchSize: 1000,
    flushIntervalMs: 50,
    enableCircuitBreaker: true,
    enableMonitoring: true,
    samplingRate: 100
  });
  
  await tracker.start();
  
  // Monitor statistics every 10 seconds
  const monitorInterval = setInterval(() => {
    const stats = tracker.getStats();
    
    console.log('\n📊 === Real-Time Statistics ===');
    
    // Throughput
    console.log('\n🚀 Throughput:');
    console.log(`  Events/s: ${stats.performance.eventsPerSecond.toFixed(2)}`);
    console.log(`  Writes/s: ${stats.performance.writesPerSecond.toFixed(2)}`);
    console.log(`  Cache Ops/s: ${stats.performance.cacheOpsPerSecond.toFixed(2)}`);
    
    // Latency
    console.log('\n⏱️  Latency (ms):');
    console.log(`  Event Decode - p50: ${stats.performance.latency.event_decode?.p50.toFixed(2)}, p95: ${stats.performance.latency.event_decode?.p95.toFixed(2)}, p99: ${stats.performance.latency.event_decode?.p99.toFixed(2)}`);
    console.log(`  Worker Processing - p50: ${stats.performance.latency.worker_processing?.p50.toFixed(2)}, p95: ${stats.performance.latency.worker_processing?.p95.toFixed(2)}, p99: ${stats.performance.latency.worker_processing?.p99.toFixed(2)}`);
    console.log(`  End-to-End - p50: ${stats.performance.latency.end_to_end?.p50.toFixed(2)}, p95: ${stats.performance.latency.end_to_end?.p95.toFixed(2)}, p99: ${stats.performance.latency.end_to_end?.p99.toFixed(2)}`);
    
    // Workers
    console.log('\n👷 Workers:');
    console.log(`  Active: ${stats.workers.activeWorkers}/${tracker['config'].workerCount}`);
    console.log(`  Queue Depth: ${stats.workers.queueDepth}`);
    console.log(`  Events Processed: ${stats.workers.eventsProcessed}`);
    console.log(`  Throughput: ${stats.workers.throughput.toFixed(2)} events/s`);
    
    // Batch Writer
    console.log('\n💾 Batch Writer:');
    console.log(`  Pending Writes: ${stats.batchWriter.pendingWrites}`);
    console.log(`  Total Writes: ${stats.batchWriter.totalWrites}`);
    console.log(`  Writes/s: ${stats.batchWriter.writesPerSecond}`);
    console.log(`  Avg Flush Time: ${stats.batchWriter.averageFlushTime.toFixed(2)}ms`);
    
    // Memory
    console.log('\n🧠 Memory:');
    console.log(`  Active Objects: ${stats.memory.activeObjects}/${stats.memory.poolSize}`);
    console.log(`  Heap Used: ${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  GC Pauses: ${stats.memory.gcPauses}`);
    console.log(`  Avg GC Pause: ${stats.memory.averageGCPause.toFixed(2)}ms`);
    
    // Circuit Breakers
    console.log('\n🛡️  Circuit Breakers:');
    console.log(`  Database: ${stats.circuitBreakers.database.state} (failures: ${stats.circuitBreakers.database.failureCount})`);
    console.log(`  RPC: ${stats.circuitBreakers.rpc.state} (failures: ${stats.circuitBreakers.rpc.failureCount})`);
    
    console.log('\n================================\n');
    
  }, 10000); // Every 10 seconds
  
  // Run for 2 minutes
  await new Promise(resolve => setTimeout(resolve, 120000));
  
  clearInterval(monitorInterval);
  await tracker.shutdown();
  await prisma.$disconnect();
  
  console.log('\n✅ Example 5 complete\n');
}

/**
 * Run examples
 */
async function main() {
  const example = process.argv[2] || '1';
  
  switch (example) {
    case '1':
      await basicExample();
      break;
    case '2':
      await highThroughputExample();
      break;
    case '3':
      await lowLatencyExample();
      break;
    case '4':
      await productionExample();
      break;
    case '5':
      await monitoringExample();
      break;
    default:
      console.log('Usage: ts-node high-performance-tracker.example.ts [1-5]');
      console.log('  1: Basic Setup');
      console.log('  2: High-Throughput Configuration');
      console.log('  3: Low-Latency Configuration');
      console.log('  4: Production Setup');
      console.log('  5: Statistics and Monitoring');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error running example:', error);
    process.exit(1);
  });
}

export {
  basicExample,
  highThroughputExample,
  lowLatencyExample,
  productionExample,
  monitoringExample
};
