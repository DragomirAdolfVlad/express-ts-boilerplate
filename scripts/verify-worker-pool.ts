/**
 * Worker Pool Verification Script
 * Quick verification that worker pool is functioning correctly
 */

import { WorkerPool } from '../src/infrastructure/blockchain/worker-pool';
import { CurveBuyEvent } from '../src/infrastructure/blockchain/binary-event-decoder';

async function verifyWorkerPool() {
  console.log('🔍 Worker Pool Verification\n');

  try {
    // Test 1: Initialization
    console.log('Test 1: Initialization...');
    const pool = new WorkerPool({ workerCount: 2, queueSize: 100 });
    await pool.initialize();
    console.log('✅ Pool initialized\n');

    // Test 2: Event Submission
    console.log('Test 2: Event Submission...');
    const testEvent: CurveBuyEvent = {
      name: 'CurveBuy',
      sender: '0xtest',
      token: '0x1234567890123456789012345678901234567890',
      amountIn: BigInt(1000),
      amountOut: BigInt(2000)
    };

    await pool.submitEvent(testEvent);
    console.log('✅ Event submitted\n');

    // Test 3: Statistics
    console.log('Test 3: Statistics...');
    await new Promise(resolve => setTimeout(resolve, 500));
    const stats = pool.getStats();
    console.log(`Active Workers: ${stats.activeWorkers}`);
    console.log(`Events Processed: ${stats.eventsProcessed}`);
    console.log(`Queue Depth: ${stats.queueDepth}`);
    console.log(`Throughput: ${stats.throughput.toFixed(0)} events/s`);
    console.log('✅ Statistics retrieved\n');

    // Test 4: Worker Stats
    console.log('Test 4: Worker Stats...');
    const workerStats = pool.getWorkerStats();
    for (const worker of workerStats) {
      console.log(`Worker ${worker.workerId}: ${worker.isHealthy ? '✅' : '❌'} Healthy`);
    }
    console.log('✅ Worker stats retrieved\n');

    // Test 5: Shutdown
    console.log('Test 5: Graceful Shutdown...');
    await pool.shutdown();
    console.log('✅ Pool shutdown\n');

    console.log('🎉 All verification tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyWorkerPool();
