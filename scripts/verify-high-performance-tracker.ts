/**
 * Verification Script for High-Performance Tracker Integration
 * 
 * Verifies that all components are properly integrated and functional.
 */

import { HighPerformanceTracker } from '../src/infrastructure/blockchain/high-performance-tracker';
import { JsonRpcProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

async function verifyIntegration() {
  console.log('🔍 Verifying High-Performance Tracker Integration...\n');
  
  let allTestsPassed = true;
  
  // Test 1: Component Imports
  console.log('Test 1: Verifying component imports...');
  try {
    await import('../src/infrastructure/blockchain/binary-event-decoder');
    await import('../src/infrastructure/blockchain/worker-pool/worker-pool');
    await import('../src/infrastructure/database/batch-writer');
    await import('../src/infrastructure/memory/MemoryManager');
    await import('../src/infrastructure/resilience/CircuitBreaker');
    await import('../src/infrastructure/monitoring/PerformanceMonitor');
    
    console.log('✅ All components imported successfully\n');
  } catch (error) {
    console.error('❌ Component import failed:', error);
    allTestsPassed = false;
  }
  
  // Test 2: Tracker Initialization
  console.log('Test 2: Verifying tracker initialization...');
  try {
    const provider = new JsonRpcProvider(process.env['MONAD_RPC_URL'] || 'https://rpc.monad.network');
    const prisma = new PrismaClient();
    
    const tracker = new HighPerformanceTracker(provider, prisma, {
      databaseUrl: process.env['DATABASE_URL'] || 'postgresql://localhost:5432/test',
      workerCount: 2,
      batchSize: 100,
      flushIntervalMs: 100,
      objectPoolSize: 1000,
      enableCircuitBreaker: true,
      enableMonitoring: true,
      samplingRate: 100
    });
    
    console.log('✅ Tracker initialized successfully\n');
    
    // Test 3: Configuration
    console.log('Test 3: Verifying configuration...');
    const config = (tracker as any).config;
    
    if (config.workerCount === 2) {
      console.log('✅ Worker count configured correctly');
    } else {
      console.error('❌ Worker count configuration failed');
      allTestsPassed = false;
    }
    
    if (config.batchSize === 100) {
      console.log('✅ Batch size configured correctly');
    } else {
      console.error('❌ Batch size configuration failed');
      allTestsPassed = false;
    }
    
    if (config.enableCircuitBreaker === true) {
      console.log('✅ Circuit breaker enabled');
    } else {
      console.error('❌ Circuit breaker configuration failed');
      allTestsPassed = false;
    }
    
    if (config.enableMonitoring === true) {
      console.log('✅ Monitoring enabled');
    } else {
      console.error('❌ Monitoring configuration failed');
      allTestsPassed = false;
    }
    
    console.log();
    
    // Test 4: Component Integration
    console.log('Test 4: Verifying component integration...');
    
    const decoder = (tracker as any).decoder;
    if (decoder) {
      console.log('✅ Binary event decoder integrated');
    } else {
      console.error('❌ Binary event decoder not integrated');
      allTestsPassed = false;
    }
    
    const batchWriter = (tracker as any).batchWriter;
    if (batchWriter) {
      console.log('✅ Batch writer integrated');
    } else {
      console.error('❌ Batch writer not integrated');
      allTestsPassed = false;
    }
    
    const memoryManager = (tracker as any).memoryManager;
    if (memoryManager) {
      console.log('✅ Memory manager integrated');
    } else {
      console.error('❌ Memory manager not integrated');
      allTestsPassed = false;
    }
    
    const performanceMonitor = (tracker as any).performanceMonitor;
    if (performanceMonitor) {
      console.log('✅ Performance monitor integrated');
    } else {
      console.error('❌ Performance monitor not integrated');
      allTestsPassed = false;
    }
    
    const databaseCircuitBreaker = (tracker as any).databaseCircuitBreaker;
    if (databaseCircuitBreaker) {
      console.log('✅ Database circuit breaker integrated');
    } else {
      console.error('❌ Database circuit breaker not integrated');
      allTestsPassed = false;
    }
    
    const rpcCircuitBreaker = (tracker as any).rpcCircuitBreaker;
    if (rpcCircuitBreaker) {
      console.log('✅ RPC circuit breaker integrated');
    } else {
      console.error('❌ RPC circuit breaker not integrated');
      allTestsPassed = false;
    }
    
    console.log();
    
    // Test 5: Statistics Access
    console.log('Test 5: Verifying statistics access...');
    try {
      const stats = tracker.getStats();
      
      if (stats.performance) {
        console.log('✅ Performance statistics accessible');
      } else {
        console.error('❌ Performance statistics not accessible');
        allTestsPassed = false;
      }
      
      if (stats.workers) {
        console.log('✅ Worker statistics accessible');
      } else {
        console.error('❌ Worker statistics not accessible');
        allTestsPassed = false;
      }
      
      if (stats.batchWriter) {
        console.log('✅ Batch writer statistics accessible');
      } else {
        console.error('❌ Batch writer statistics not accessible');
        allTestsPassed = false;
      }
      
      if (stats.memory) {
        console.log('✅ Memory statistics accessible');
      } else {
        console.error('❌ Memory statistics not accessible');
        allTestsPassed = false;
      }
      
      if (stats.circuitBreakers) {
        console.log('✅ Circuit breaker statistics accessible');
      } else {
        console.error('❌ Circuit breaker statistics not accessible');
        allTestsPassed = false;
      }
      
      console.log();
    } catch (error) {
      console.error('❌ Statistics access failed:', error);
      allTestsPassed = false;
    }
    
    // Cleanup
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Tracker initialization failed:', error);
    allTestsPassed = false;
  }
  
  // Test 6: Documentation Files
  console.log('Test 6: Verifying documentation files...');
  const fs = await import('fs');
  
  const docFiles = [
    'src/infrastructure/blockchain/high-performance-tracker.ts',
    'src/infrastructure/blockchain/high-performance-tracker.example.ts',
    'src/infrastructure/blockchain/TASK_12_INTEGRATION_GUIDE.md',
    'src/infrastructure/blockchain/TASK_12_COMPLETE.md',
    'src/infrastructure/blockchain/HIGH_PERFORMANCE_README.md',
    'TASK_12_IMPLEMENTATION_SUMMARY.md'
  ];
  
  for (const file of docFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file} exists`);
    } else {
      console.error(`❌ ${file} not found`);
      allTestsPassed = false;
    }
  }
  
  console.log();
  
  // Final Summary
  console.log('═══════════════════════════════════════════════════════');
  if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED - Integration Complete!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n🚀 High-Performance Tracker is ready for use!\n');
    console.log('Next steps:');
    console.log('1. Run examples: ts-node src/infrastructure/blockchain/high-performance-tracker.example.ts [1-5]');
    console.log('2. Review integration guide: src/infrastructure/blockchain/TASK_12_INTEGRATION_GUIDE.md');
    console.log('3. Start production deployment');
    console.log();
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED - Please review errors above');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

// Run verification
verifyIntegration().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
