#!/usr/bin/env ts-node

/**
 * Production Readiness Verification Script
 * Verifies all systems are working correctly before deployment
 */

import { PrismaClient } from '@prisma/client';
import { JsonRpcProvider } from 'ethers';
import { sharedMetrics } from '../src/utils/shared-metrics';

async function verifyDatabase(): Promise<boolean> {
  try {
    const prisma = new PrismaClient();
    await prisma.$connect();
    
    // Test basic queries
    const tradeCount = await prisma.monadTokenTrade.count();
    const tokenCount = await prisma.monadLaunchedToken.count();
    
    console.log('✅ Database: Connected');
    console.log(`   - Trades: ${tradeCount}`);
    console.log(`   - Tokens: ${tokenCount}`);
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error('❌ Database: Failed', error);
    return false;
  }
}

async function verifyRPC(): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(process.env['MONAD_HTTP_URL']);
    const blockNumber = await provider.getBlockNumber();
    
    console.log('✅ RPC: Connected');
    console.log(`   - Latest block: ${blockNumber}`);
    
    return true;
  } catch (error) {
    console.error('❌ RPC: Failed', error);
    return false;
  }
}

function verifyMetricsSystem(): boolean {
  try {
    // Test metrics recording
    sharedMetrics.recordRPCCall('test', 100, true);
    sharedMetrics.recordBlockProcessing(12345, 200, 5);
    sharedMetrics.recordDatabaseOperation('test', 50, true);
    
    // Test metrics reading
    const metrics = sharedMetrics.getRecentMetrics(60000);
    
    console.log('✅ Metrics: Working');
    console.log(`   - RPC calls: ${metrics.rpcCalls.length}`);
    console.log(`   - Block processing: ${metrics.blockProcessing.length}`);
    console.log(`   - DB operations: ${metrics.databaseOperations.length}`);
    
    return true;
  } catch (error) {
    console.error('❌ Metrics: Failed', error);
    return false;
  }
}

function verifyEnvironment(): boolean {
  const requiredEnvVars = [
    'MONAD_HTTP_URL',
    'DATABASE_URL',
    'CONTRACT_ADDRESS'
  ];
  
  const missing = requiredEnvVars.filter(env => !process.env[env]);
  
  if (missing.length > 0) {
    console.error('❌ Environment: Missing variables:', missing);
    return false;
  }
  
  console.log('✅ Environment: All variables present');
  return true;
}

async function main() {
  console.log('🔍 PRODUCTION READINESS VERIFICATION');
  console.log('=====================================');
  console.log('');
  
  const checks = [
    { name: 'Environment', fn: () => Promise.resolve(verifyEnvironment()) },
    { name: 'Database', fn: verifyDatabase },
    { name: 'RPC Connection', fn: verifyRPC },
    { name: 'Metrics System', fn: () => Promise.resolve(verifyMetricsSystem()) }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    try {
      const passed = await check.fn();
      if (!passed) allPassed = false;
    } catch (error) {
      console.error(`❌ ${check.name}: Error`, error);
      allPassed = false;
    }
    console.log('');
  }
  
  console.log('=====================================');
  if (allPassed) {
    console.log('🎉 ALL CHECKS PASSED - PRODUCTION READY! 🚀');
    console.log('');
    console.log('Next steps:');
    console.log('1. Start tracker: npm run dev');
    console.log('2. Monitor metrics: npm run metrics-monitor');
    console.log('3. Deploy to production');
  } else {
    console.log('❌ SOME CHECKS FAILED - FIX ISSUES BEFORE DEPLOYMENT');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}