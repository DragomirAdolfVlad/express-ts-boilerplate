/**
 * MemoryManager Usage Example
 * 
 * Demonstrates how to use the MemoryManager for zero-copy operations
 */

import { memoryManager } from './MemoryManager';

async function demonstrateMemoryManager() {
  console.log('=== MemoryManager Demo ===\n');
  
  // 1. Acquire and use trade objects
  console.log('1. Acquiring trade objects from pool...');
  const trade1 = memoryManager.acquireTrade();
  trade1.tokenAddress = '0x1234567890abcdef';
  trade1.trader = '0xabcdef1234567890';
  trade1.isBuy = true;
  trade1.wmonAmount = 1000;
  trade1.tokenAmount = 500;
  trade1.pricePerToken = 2.0;
  trade1.blockNumber = '12345';
  trade1.transactionHash = '0xhash123';
  
  console.log('Trade object populated:', {
    tokenAddress: trade1.tokenAddress,
    trader: trade1.trader,
    wmonAmount: trade1.wmonAmount,
  });
  
  // 2. Release trade back to pool
  console.log('\n2. Releasing trade back to pool...');
  memoryManager.releaseTrade(trade1);
  console.log('Trade cleared:', {
    tokenAddress: trade1.tokenAddress,
    wmonAmount: trade1.wmonAmount,
  });
  
  // 3. Acquire buffer from pool
  console.log('\n3. Acquiring buffer from pool...');
  const buffer = memoryManager.acquireBuffer(1024);
  buffer.write('Hello, MemoryManager!', 0, 'utf-8');
  console.log('Buffer content:', buffer.toString('utf-8', 0, 21));
  
  // 4. Release buffer
  console.log('\n4. Releasing buffer back to pool...');
  memoryManager.releaseBuffer(buffer);
  
  // 5. Demonstrate high-throughput scenario
  console.log('\n5. High-throughput scenario (1000 operations)...');
  const startTime = performance.now();
  
  for (let i = 0; i < 1000; i++) {
    const trade = memoryManager.acquireTrade();
    trade.tokenAddress = `0x${i.toString(16)}`;
    trade.wmonAmount = i * 100;
    memoryManager.releaseTrade(trade);
  }
  
  const duration = performance.now() - startTime;
  console.log(`Completed 1000 acquire/release cycles in ${duration.toFixed(2)}ms`);
  console.log(`Average time per operation: ${(duration / 1000).toFixed(4)}ms`);
  
  // 6. Show statistics
  console.log('\n6. Memory statistics:');
  const stats = memoryManager.getStats();
  console.log({
    poolSize: stats.poolSize,
    activeObjects: stats.activeObjects,
    acquisitions: stats.acquisitions,
    releases: stats.releases,
    bufferPoolSize: stats.bufferPoolSize,
    activeBuffers: stats.activeBuffers,
    heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
    rssMB: (stats.rss / 1024 / 1024).toFixed(2),
    gcPauses: stats.gcPauses,
    avgGCPause: stats.averageGCPause.toFixed(2) + 'ms',
  });
  
  console.log('\n=== Demo Complete ===');
}

// Run demo if executed directly
if (require.main === module) {
  demonstrateMemoryManager().catch(console.error);
}

export { demonstrateMemoryManager };
