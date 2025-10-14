/**
 * Binary Event Decoder - Usage Example
 * 
 * This file demonstrates how to use the BinaryEventDecoder
 * and includes performance benchmarks
 */

import { binaryEventDecoder, RawLog } from './binary-event-decoder';

/**
 * Example: Decode a CurveBuy event
 */
async function exampleDecodeCurveBuy() {
  console.log('\n=== Example: Decode CurveBuy Event ===\n');

  // Initialize decoder (call once at startup)
  await binaryEventDecoder.initialize();

  // Example raw log from blockchain
  const rawLog: RawLog = {
    topics: [
      '0x...', // Event signature (will be computed)
      '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0', // sender
      '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'  // token
    ],
    data: '0x' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // amountIn (1 ETH)
      '00000000000000000000000000000000000000000000003635c9adc5dea00000', // amountOut (1000 tokens)
    address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    blockNumber: '0x1234',
    blockHash: '0xabcd...',
    transactionHash: '0x1234...',
    logIndex: '0x0'
  };

  // Get event topics for filtering
  const topics = binaryEventDecoder.getEventTopics();
  if (topics) {
    rawLog.topics[0] = topics.CurveBuy;
  }

  // Decode the event
  const startTime = performance.now();
  const decoded = binaryEventDecoder.decode(rawLog.topics, rawLog.data);
  const endTime = performance.now();

  console.log('Decoded event:', decoded);
  console.log(`Decode time: ${(endTime - startTime).toFixed(4)}ms`);
}

/**
 * Example: Decode a CurveSell event
 */
async function exampleDecodeCurveSell() {
  console.log('\n=== Example: Decode CurveSell Event ===\n');

  await binaryEventDecoder.initialize();

  const topics = binaryEventDecoder.getEventTopics();
  if (!topics) return;

  const rawLog: RawLog = {
    topics: [
      topics.CurveSell,
      '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0',
      '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'
    ],
    data: '0x' +
      '00000000000000000000000000000000000000000000003635c9adc5dea00000' + // amountIn (1000 tokens)
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000', // amountOut (1 ETH)
    address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
    blockNumber: '0x1234',
    blockHash: '0xabcd...',
    transactionHash: '0x1234...',
    logIndex: '0x0'
  };

  const startTime = performance.now();
  const decoded = binaryEventDecoder.decode(rawLog.topics, rawLog.data);
  const endTime = performance.now();

  console.log('Decoded event:', decoded);
  console.log(`Decode time: ${(endTime - startTime).toFixed(4)}ms`);
}

/**
 * Example: Batch decode multiple events
 */
async function exampleBatchDecode() {
  console.log('\n=== Example: Batch Decode Events ===\n');

  await binaryEventDecoder.initialize();

  const topics = binaryEventDecoder.getEventTopics();
  if (!topics) return;

  // Create 100 sample events
  const logs: RawLog[] = [];
  for (let i = 0; i < 100; i++) {
    logs.push({
      topics: [
        i % 2 === 0 ? topics.CurveBuy : topics.CurveSell,
        '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0',
        '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'
      ],
      data: '0x' +
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
        '00000000000000000000000000000000000000000000003635c9adc5dea00000',
      address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
      blockNumber: `0x${i.toString(16)}`,
      blockHash: '0xabcd...',
      transactionHash: `0x${i.toString(16)}...`,
      logIndex: '0x0'
    });
  }

  // Batch decode
  const startTime = performance.now();
  const decoded = binaryEventDecoder.decodeBatch(logs);
  const endTime = performance.now();

  console.log(`Decoded ${decoded.length} events`);
  console.log(`Total time: ${(endTime - startTime).toFixed(4)}ms`);
  console.log(`Average time per event: ${((endTime - startTime) / logs.length).toFixed(4)}ms`);
  console.log(`Throughput: ${(logs.length / ((endTime - startTime) / 1000)).toFixed(0)} events/sec`);
}

/**
 * Performance benchmark: Compare with ethers.js
 */
async function benchmarkPerformance() {
  console.log('\n=== Performance Benchmark ===\n');

  await binaryEventDecoder.initialize();

  const topics = binaryEventDecoder.getEventTopics();
  if (!topics) return;

  const iterations = 1000;
  const logs: RawLog[] = [];

  // Create test data
  for (let i = 0; i < iterations; i++) {
    logs.push({
      topics: [
        topics.CurveBuy,
        '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0',
        '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'
      ],
      data: '0x' +
        '0000000000000000000000000000000000000000000000000de0b6b3a7640000' +
        '00000000000000000000000000000000000000000000003635c9adc5dea00000',
      address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
      blockNumber: `0x${i.toString(16)}`,
      blockHash: '0xabcd...',
      transactionHash: `0x${i.toString(16)}...`,
      logIndex: '0x0'
    });
  }

  // Benchmark binary decoder
  const binaryStart = performance.now();
  for (const log of logs) {
    binaryEventDecoder.decode(log.topics, log.data);
  }
  const binaryEnd = performance.now();
  const binaryTime = binaryEnd - binaryStart;

  console.log(`Binary Decoder:`);
  console.log(`  Total time: ${binaryTime.toFixed(2)}ms`);
  console.log(`  Average per event: ${(binaryTime / iterations).toFixed(4)}ms`);
  console.log(`  Throughput: ${(iterations / (binaryTime / 1000)).toFixed(0)} events/sec`);

  // Note: ethers.js comparison would require actual ethers.js implementation
  console.log(`\nTarget: < 0.1ms per event (100x faster than ethers.js)`);
  console.log(`Status: ${(binaryTime / iterations) < 0.1 ? '✅ PASSED' : '⚠️  NEEDS OPTIMIZATION'}`);
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Binary Event Decoder - Examples & Benchmarks        ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    await exampleDecodeCurveBuy();
    await exampleDecodeCurveSell();
    await exampleBatchDecode();
    await benchmarkPerformance();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples();
}

export { runExamples };
