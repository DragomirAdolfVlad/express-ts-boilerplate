/**
 * Worker Pool Test Script
 * Demonstrates and tests the worker pool implementation
 */

import { WorkerPool } from '../src/infrastructure/blockchain/worker-pool';
import { DecodedEvent, CurveBuyEvent, CurveSellEvent, CurveCreateEvent } from '../src/infrastructure/blockchain/binary-event-decoder';

async function testWorkerPool() {
  console.log('=== Worker Pool Test ===\n');

  // Initialize worker pool
  console.log('Initializing worker pool with 4 workers...');
  const pool = new WorkerPool({
    workerCount: 4,
    queueSize: 1000,
    healthCheckInterval: 2000,
    maxRestarts: 3
  });

  await pool.initialize();
  console.log('✓ Worker pool initialized\n');

  // Generate test events
  console.log('Generating test events...');
  const testEvents: DecodedEvent[] = [];
  const tokenAddresses = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
    '0x4444444444444444444444444444444444444444'
  ];

  for (let i = 0; i < 100; i++) {
    const tokenAddress = tokenAddresses[i % tokenAddresses.length]!;
    const eventType = i % 3;
    
    if (eventType === 0) {
      testEvents.push({
        name: 'CurveBuy',
        sender: `0xsender${i}`,
        token: tokenAddress,
        amountIn: BigInt(1000 + i * 100),
        amountOut: BigInt(2000 + i * 200)
      } as CurveBuyEvent);
    } else if (eventType === 1) {
      testEvents.push({
        name: 'CurveSell',
        sender: `0xsender${i}`,
        token: tokenAddress,
        amountIn: BigInt(1000 + i * 100),
        amountOut: BigInt(2000 + i * 200)
      } as CurveSellEvent);
    } else {
      testEvents.push({
        name: 'CurveCreate',
        creator: `0xcreator${i}`,
        token: tokenAddress,
        pool: `0xpool${i}`,
        tokenName: `Token${i}`,
        symbol: `TKN${i}`,
        tokenURI: `https://example.com/token${i}`,
        virtualMon: BigInt(1000000),
        virtualToken: BigInt(1000000),
        targetTokenAmount: BigInt(1000000)
      } as CurveCreateEvent);
    }
  }
  console.log(`✓ Generated ${testEvents.length} test events\n`);

  // Submit events
  console.log('Submitting events to worker pool...');
  const startTime = Date.now();
  
  for (const event of testEvents) {
    try {
      await pool.submitEvent(event);
    } catch (error) {
      console.error('Error submitting event:', error);
    }
  }

  const submitTime = Date.now() - startTime;
  console.log(`✓ Submitted ${testEvents.length} events in ${submitTime}ms`);
  console.log(`  Submission rate: ${(testEvents.length / submitTime * 1000).toFixed(0)} events/s\n`);

  // Wait for processing
  console.log('Waiting for events to be processed...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get statistics
  console.log('\n=== Worker Pool Statistics ===');
  const stats = pool.getStats();
  console.log(`Active Workers: ${stats.activeWorkers}`);
  console.log(`Events Processed: ${stats.eventsProcessed}`);
  console.log(`Queue Depth: ${stats.queueDepth}`);
  console.log(`Average Latency: ${stats.averageLatency.toFixed(2)}ms`);
  console.log(`Throughput: ${stats.throughput.toFixed(0)} events/s`);
  console.log(`Failed Workers: ${stats.failedWorkers}`);
  console.log(`Restarted Workers: ${stats.restartedWorkers}`);

  // Get worker-level statistics
  console.log('\n=== Individual Worker Statistics ===');
  const workerStats = pool.getWorkerStats();
  for (const worker of workerStats) {
    console.log(`\nWorker ${worker.workerId}:`);
    console.log(`  Events Processed: ${worker.eventsProcessed}`);
    console.log(`  Errors: ${worker.errors}`);
    console.log(`  Avg Processing Time: ${worker.averageProcessingTime.toFixed(2)}ms`);
    console.log(`  Healthy: ${worker.isHealthy ? '✓' : '✗'}`);
    console.log(`  Last Health Check: ${new Date(worker.lastHealthCheck).toISOString()}`);
  }

  // Performance test
  console.log('\n=== Performance Test ===');
  console.log('Submitting 1000 events...');
  
  const perfEvents: CurveBuyEvent[] = [];
  for (let i = 0; i < 1000; i++) {
    perfEvents.push({
      name: 'CurveBuy',
      sender: `0x${i}`,
      token: tokenAddresses[i % tokenAddresses.length]!,
      amountIn: BigInt(1000),
      amountOut: BigInt(2000)
    });
  }

  const perfStart = Date.now();
  for (const event of perfEvents) {
    try {
      await pool.submitEvent(event);
    } catch (error) {
      // Queue might be full, that's ok for this test
    }
  }
  const perfTime = Date.now() - perfStart;

  console.log(`✓ Submitted 1000 events in ${perfTime}ms`);
  console.log(`  Rate: ${(1000 / perfTime * 1000).toFixed(0)} events/s`);

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 3000));

  const finalStats = pool.getStats();
  console.log(`\nFinal Statistics:`);
  console.log(`  Total Events Processed: ${finalStats.eventsProcessed}`);
  console.log(`  Overall Throughput: ${finalStats.throughput.toFixed(0)} events/s`);
  console.log(`  Average Latency: ${finalStats.averageLatency.toFixed(2)}ms`);

  // Shutdown
  console.log('\n=== Shutting Down ===');
  await pool.shutdown();
  console.log('✓ Worker pool shutdown complete');

  console.log('\n=== Test Complete ===');
}

// Run test
testWorkerPool().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
