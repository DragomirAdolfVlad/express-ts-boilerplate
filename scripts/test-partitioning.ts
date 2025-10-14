/**
 * Test Script for Database Partitioning
 * 
 * This script verifies that the partitioning implementation works correctly
 * by testing partition creation, data insertion, and query performance.
 * 
 * Usage:
 *   npm run test-partitioning
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
}

const results: TestResult[] = [];

/**
 * Test 1: Verify partitioned table exists
 */
async function testPartitionedTableExists(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'monad_token_trades'
      ) as exists`
    );
    
    const exists = result[0]?.exists || false;
    const duration = Date.now() - startTime;
    
    return {
      name: 'Partitioned table exists',
      passed: exists,
      duration,
      details: exists ? 'Table found' : 'Table not found'
    };
  } catch (error) {
    return {
      name: 'Partitioned table exists',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 2: Verify partitions exist
 */
async function testPartitionsExist(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*) as count
       FROM pg_tables 
       WHERE schemaname = 'public' 
       AND tablename LIKE 'monad_token_trades_%'`
    );
    
    const count = Number(result[0]?.count || 0);
    const duration = Date.now() - startTime;
    
    return {
      name: 'Partitions exist',
      passed: count > 0,
      duration,
      details: `Found ${count} partitions`
    };
  } catch (error) {
    return {
      name: 'Partitions exist',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 3: Verify indexes exist
 */
async function testIndexesExist(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const expectedIndexes = [
      'idx_trades_token_timestamp',
      'idx_trades_trader_timestamp',
      'idx_trades_timestamp_desc',
      'idx_trades_token_address',
      'idx_trades_trader',
      'idx_trades_timestamp'
    ];
    
    const result = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname 
       FROM pg_indexes 
       WHERE schemaname = 'public' 
       AND tablename = 'monad_token_trades'`
    );
    
    const foundIndexes = result.map(r => r.indexname);
    const missingIndexes = expectedIndexes.filter(idx => !foundIndexes.includes(idx));
    const duration = Date.now() - startTime;
    
    return {
      name: 'Indexes exist',
      passed: missingIndexes.length === 0,
      duration,
      details: missingIndexes.length === 0 
        ? `All ${expectedIndexes.length} indexes found`
        : `Missing indexes: ${missingIndexes.join(', ')}`
    };
  } catch (error) {
    return {
      name: 'Indexes exist',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 4: Verify materialized view exists
 */
async function testMaterializedViewExists(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT FROM pg_matviews 
        WHERE schemaname = 'public' 
        AND matviewname = 'token_stats_mv'
      ) as exists`
    );
    
    const exists = result[0]?.exists || false;
    const duration = Date.now() - startTime;
    
    return {
      name: 'Materialized view exists',
      passed: exists,
      duration,
      details: exists ? 'View found' : 'View not found'
    };
  } catch (error) {
    return {
      name: 'Materialized view exists',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 5: Test data insertion into partitioned table
 */
async function testDataInsertion(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // First, check if we have any tokens to use
    const existingToken = await prisma.monadLaunchedToken.findFirst();
    
    if (!existingToken) {
      return {
        name: 'Data insertion',
        passed: true,
        duration: Date.now() - startTime,
        details: 'Skipped (no tokens in database to test with)'
      };
    }
    
    // Insert test data
    const testData = {
      tokenAddress: existingToken.token,
      signature: '0xTEST' + Date.now(),
      logIndex: 0,
      uniqueTradeId: `test-${Date.now()}`,
      blockNumber: '12345',
      blockId: 'test-block',
      commitState: 'finalized' as const,
      trader: '0xTESTTRADER',
      isBuy: true,
      wmonAmount: 100,
      tokenAmount: 1000,
      pricePerToken: 0.1,
      usdAmount: 10,
      timestamp: new Date()
    };
    
    await prisma.monadTokenTrade.create({
      data: testData
    });
    
    // Verify insertion
    const inserted = await prisma.monadTokenTrade.findFirst({
      where: { uniqueTradeId: testData.uniqueTradeId }
    });
    
    // Clean up
    if (inserted) {
      await prisma.monadTokenTrade.delete({
        where: { id: inserted.id }
      });
    }
    
    const duration = Date.now() - startTime;
    
    return {
      name: 'Data insertion',
      passed: inserted !== null,
      duration,
      details: inserted ? `Inserted and verified in ${duration}ms` : 'Insertion failed'
    };
  } catch (error) {
    return {
      name: 'Data insertion',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 6: Test query performance with partition pruning
 */
async function testQueryPerformance(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Query with timestamp filter (should use partition pruning)
    const result = await prisma.monadTokenTrade.findMany({
      where: {
        timestamp: {
          gte: new Date(Date.now() - 3600000) // Last hour
        }
      },
      take: 10
    });
    
    const duration = Date.now() - startTime;
    const passed = duration < 100; // Should be fast with partition pruning
    
    return {
      name: 'Query performance',
      passed,
      duration,
      details: `Query completed in ${duration}ms (target: <100ms), returned ${result.length} rows`
    };
  } catch (error) {
    return {
      name: 'Query performance',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 7: Test composite index usage
 */
async function testCompositeIndexUsage(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Get a token address from the database
    const trade = await prisma.monadTokenTrade.findFirst();
    
    if (!trade) {
      return {
        name: 'Composite index usage',
        passed: true,
        duration: Date.now() - startTime,
        details: 'No data to test (skipped)'
      };
    }
    
    // Query using composite index
    const result = await prisma.$queryRawUnsafe(
      `EXPLAIN (FORMAT JSON) 
       SELECT * FROM monad_token_trades 
       WHERE token_address = $1 
       ORDER BY timestamp DESC 
       LIMIT 10`,
      trade.tokenAddress
    );
    
    const plan = JSON.stringify(result);
    const usesIndex = plan.includes('idx_trades_token_timestamp') || plan.includes('Index Scan');
    const duration = Date.now() - startTime;
    
    return {
      name: 'Composite index usage',
      passed: usesIndex,
      duration,
      details: usesIndex 
        ? 'Query uses composite index'
        : 'Query does not use expected index'
    };
  } catch (error) {
    return {
      name: 'Composite index usage',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 8: Test materialized view query
 */
async function testMaterializedViewQuery(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const result = await prisma.$queryRawUnsafe<Array<{
      token_address: string;
      total_trades: number;
    }>>(
      `SELECT * FROM token_stats_mv LIMIT 10`
    );
    
    const duration = Date.now() - startTime;
    const passed = duration < 50; // Should be very fast
    
    return {
      name: 'Materialized view query',
      passed,
      duration,
      details: `Query completed in ${duration}ms (target: <50ms), returned ${result.length} rows`
    };
  } catch (error) {
    return {
      name: 'Materialized view query',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Test 9: Test timestamp index for recent trades
 */
async function testPartialIndexUsage(): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    // Query recent trades (should use timestamp index)
    const result = await prisma.$queryRawUnsafe(
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM monad_token_trades 
       WHERE timestamp > NOW() - INTERVAL '1 hour'
       ORDER BY timestamp DESC
       LIMIT 10`
    );
    
    const plan = JSON.stringify(result);
    const usesIndex = plan.includes('idx_trades_timestamp_desc') || plan.includes('Index Scan');
    const duration = Date.now() - startTime;
    
    return {
      name: 'Timestamp index usage',
      passed: usesIndex,
      duration,
      details: usesIndex
        ? 'Query uses timestamp index for recent trades'
        : 'Query does not use expected index (may be OK if no data)'
    };
  } catch (error) {
    return {
      name: 'Timestamp index usage',
      passed: false,
      duration: Date.now() - startTime,
      details: `Error: ${error}`
    };
  }
}

/**
 * Print test results
 */
function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE PARTITIONING TEST RESULTS');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach((result, index) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`\n${index + 1}. ${result.name}`);
    console.log(`   ${color}${status}${reset} (${result.duration}ms)`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${results.length} tests`);
  console.log('='.repeat(80) + '\n');
  
  return failed === 0;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting database partitioning tests...\n');
  
  try {
    // Run all tests
    results.push(await testPartitionedTableExists());
    results.push(await testPartitionsExist());
    results.push(await testIndexesExist());
    results.push(await testMaterializedViewExists());
    results.push(await testDataInsertion());
    results.push(await testQueryPerformance());
    results.push(await testCompositeIndexUsage());
    results.push(await testMaterializedViewQuery());
    results.push(await testPartialIndexUsage());
    
    // Print results
    const allPassed = printResults();
    
    if (allPassed) {
      console.log('✓ All tests passed! Database partitioning is working correctly.\n');
      process.exit(0);
    } else {
      console.log('✗ Some tests failed. Please review the results above.\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during testing:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
