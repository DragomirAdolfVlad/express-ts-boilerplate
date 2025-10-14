/**
 * Binary Event Decoder Verification Script
 * 
 * This script verifies that the binary decoder produces identical results
 * to ethers.js for all event types
 */

import { ethers } from 'ethers';
import { binaryEventDecoder } from '../src/infrastructure/blockchain/binary-event-decoder';
import { BONDING_CURVE_ABI } from '../src/infrastructure/blockchain/abis/official-nad-fun.abi';

// Test data
const TEST_CASES = {
  curveBuy: {
    topics: [
      '', // Will be filled with actual topic hash
      '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0', // sender
      '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'  // token
    ],
    data: '0x' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000' + // amountIn (1 ETH = 1e18)
      '00000000000000000000000000000000000000000000003635c9adc5dea00000', // amountOut (1000 tokens = 1000e18)
    expected: {
      sender: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
      token: '0xa1b2c3d4e5f6789012345678901234567890abcd',
      amountIn: BigInt('1000000000000000000'), // 1e18
      amountOut: BigInt('1000000000000000000000') // 1000e18
    }
  },
  curveSell: {
    topics: [
      '', // Will be filled
      '0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb0',
      '0x000000000000000000000000a1b2c3d4e5f6789012345678901234567890abcd'
    ],
    data: '0x' +
      '00000000000000000000000000000000000000000000003635c9adc5dea00000' + // amountIn (1000 tokens)
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000', // amountOut (1 ETH)
    expected: {
      sender: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
      token: '0xa1b2c3d4e5f6789012345678901234567890abcd',
      amountIn: BigInt('1000000000000000000000'),
      amountOut: BigInt('1000000000000000000')
    }
  }
};

async function verifyDecoding() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Binary Event Decoder - Verification Test            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Initialize decoder
  await binaryEventDecoder.initialize();
  const topics = binaryEventDecoder.getEventTopics();
  
  if (!topics) {
    console.error('❌ Failed to initialize event topics');
    process.exit(1);
  }

  // Fill in topic hashes
  TEST_CASES.curveBuy.topics[0] = topics.CurveBuy;
  TEST_CASES.curveSell.topics[0] = topics.CurveSell;

  let passed = 0;
  let failed = 0;

  // Test CurveBuy
  console.log('Testing CurveBuy Event...');
  console.log('─────────────────────────────────────────────────────────');
  
  const buyBinary = binaryEventDecoder.decodeCurveBuy(
    TEST_CASES.curveBuy.topics,
    TEST_CASES.curveBuy.data
  );

  const ethersInterface = new ethers.Interface(BONDING_CURVE_ABI);
  const buyEthers = ethersInterface.parseLog({
    topics: TEST_CASES.curveBuy.topics,
    data: TEST_CASES.curveBuy.data
  });

  if (!buyBinary) {
    console.error('❌ Binary decoder returned null for CurveBuy');
    failed++;
  } else if (!buyEthers) {
    console.error('❌ Ethers decoder returned null for CurveBuy');
    failed++;
  } else {
    // Compare results
    const senderMatch = buyBinary.sender.toLowerCase() === buyEthers.args['sender'].toLowerCase();
    const tokenMatch = buyBinary.token.toLowerCase() === buyEthers.args['token'].toLowerCase();
    const amountInMatch = buyBinary.amountIn === buyEthers.args['amountIn'];
    const amountOutMatch = buyBinary.amountOut === buyEthers.args['amountOut'];

    console.log(`  Sender:    ${senderMatch ? '✅' : '❌'} ${buyBinary.sender}`);
    console.log(`  Token:     ${tokenMatch ? '✅' : '❌'} ${buyBinary.token}`);
    console.log(`  AmountIn:  ${amountInMatch ? '✅' : '❌'} ${buyBinary.amountIn.toString()}`);
    console.log(`  AmountOut: ${amountOutMatch ? '✅' : '❌'} ${buyBinary.amountOut.toString()}`);

    if (senderMatch && tokenMatch && amountInMatch && amountOutMatch) {
      console.log('✅ CurveBuy: PASSED\n');
      passed++;
    } else {
      console.log('❌ CurveBuy: FAILED\n');
      console.log('Expected (ethers.js):');
      console.log(`  Sender: ${buyEthers.args['sender']}`);
      console.log(`  Token: ${buyEthers.args['token']}`);
      console.log(`  AmountIn: ${buyEthers.args['amountIn'].toString()}`);
      console.log(`  AmountOut: ${buyEthers.args['amountOut'].toString()}\n`);
      failed++;
    }
  }

  // Test CurveSell
  console.log('Testing CurveSell Event...');
  console.log('─────────────────────────────────────────────────────────');
  
  const sellBinary = binaryEventDecoder.decodeCurveSell(
    TEST_CASES.curveSell.topics,
    TEST_CASES.curveSell.data
  );

  const sellEthers = ethersInterface.parseLog({
    topics: TEST_CASES.curveSell.topics,
    data: TEST_CASES.curveSell.data
  });

  if (!sellBinary) {
    console.error('❌ Binary decoder returned null for CurveSell');
    failed++;
  } else if (!sellEthers) {
    console.error('❌ Ethers decoder returned null for CurveSell');
    failed++;
  } else {
    const senderMatch = sellBinary.sender.toLowerCase() === sellEthers.args['sender'].toLowerCase();
    const tokenMatch = sellBinary.token.toLowerCase() === sellEthers.args['token'].toLowerCase();
    const amountInMatch = sellBinary.amountIn === sellEthers.args['amountIn'];
    const amountOutMatch = sellBinary.amountOut === sellEthers.args['amountOut'];

    console.log(`  Sender:    ${senderMatch ? '✅' : '❌'} ${sellBinary.sender}`);
    console.log(`  Token:     ${tokenMatch ? '✅' : '❌'} ${sellBinary.token}`);
    console.log(`  AmountIn:  ${amountInMatch ? '✅' : '❌'} ${sellBinary.amountIn.toString()}`);
    console.log(`  AmountOut: ${amountOutMatch ? '✅' : '❌'} ${sellBinary.amountOut.toString()}`);

    if (senderMatch && tokenMatch && amountInMatch && amountOutMatch) {
      console.log('✅ CurveSell: PASSED\n');
      passed++;
    } else {
      console.log('❌ CurveSell: FAILED\n');
      console.log('Expected (ethers.js):');
      console.log(`  Sender: ${sellEthers.args['sender']}`);
      console.log(`  Token: ${sellEthers.args['token']}`);
      console.log(`  AmountIn: ${sellEthers.args['amountIn'].toString()}`);
      console.log(`  AmountOut: ${sellEthers.args['amountOut'].toString()}\n`);
      failed++;
    }
  }

  // Test with real blockchain data if available
  console.log('Testing with Auto-Detect...');
  console.log('─────────────────────────────────────────────────────────');
  
  const autoDetectBuy = binaryEventDecoder.decode(
    TEST_CASES.curveBuy.topics,
    TEST_CASES.curveBuy.data
  );

  if (autoDetectBuy && autoDetectBuy.name === 'CurveBuy') {
    console.log('✅ Auto-detect correctly identified CurveBuy');
    passed++;
  } else {
    console.log('❌ Auto-detect failed for CurveBuy');
    failed++;
  }

  const autoDetectSell = binaryEventDecoder.decode(
    TEST_CASES.curveSell.topics,
    TEST_CASES.curveSell.data
  );

  if (autoDetectSell && autoDetectSell.name === 'CurveSell') {
    console.log('✅ Auto-detect correctly identified CurveSell\n');
    passed++;
  } else {
    console.log('❌ Auto-detect failed for CurveSell\n');
    failed++;
  }

  // Performance benchmark
  console.log('Performance Benchmark...');
  console.log('─────────────────────────────────────────────────────────');
  
  const iterations = 1000;
  
  // Binary decoder benchmark
  const binaryStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    binaryEventDecoder.decode(TEST_CASES.curveBuy.topics, TEST_CASES.curveBuy.data);
  }
  const binaryEnd = performance.now();
  const binaryTime = binaryEnd - binaryStart;

  // Ethers.js benchmark
  const ethersStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    ethersInterface.parseLog({
      topics: TEST_CASES.curveBuy.topics,
      data: TEST_CASES.curveBuy.data
    });
  }
  const ethersEnd = performance.now();
  const ethersTime = ethersEnd - ethersStart;

  const speedup = ethersTime / binaryTime;

  console.log(`Binary Decoder: ${binaryTime.toFixed(2)}ms (${(binaryTime / iterations).toFixed(4)}ms per event)`);
  console.log(`Ethers.js:      ${ethersTime.toFixed(2)}ms (${(ethersTime / iterations).toFixed(4)}ms per event)`);
  console.log(`Speedup:        ${speedup.toFixed(1)}x faster\n`);

  if (speedup >= 10) {
    console.log(`✅ Performance target met (${speedup.toFixed(1)}x faster than ethers.js)`);
    passed++;
  } else {
    console.log(`⚠️  Performance below target (${speedup.toFixed(1)}x, target: 10x+)`);
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Test Summary                                         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`Total Tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed! Binary decoder is working correctly.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Run verification
verifyDecoding().catch(error => {
  console.error('❌ Verification failed with error:', error);
  process.exit(1);
});
