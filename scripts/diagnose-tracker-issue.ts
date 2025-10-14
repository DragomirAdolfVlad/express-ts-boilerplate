/**
 * Diagnostic Script for Tracker Event Detection Issue
 * 
 * Checks:
 * 1. Contract addresses are correct
 * 2. Recent events exist on-chain
 * 3. Event topics are correct
 * 4. RPC connection is working
 */

import { JsonRpcProvider, ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

async function diagnoseTrackerIssue() {
  console.log('🔍 Diagnosing Tracker Event Detection Issue...\n');
  
  const rpcUrl = process.env['MONAD_RPC_URL'] || process.env['MONAD_HTTP_URL'];
  
  if (!rpcUrl) {
    console.error('❌ MONAD_RPC_URL or MONAD_HTTP_URL not set in .env!');
    process.exit(1);
  }
  
  console.log(`🔗 RPC URL: ${rpcUrl}\n`);
  
  const provider = new JsonRpcProvider(rpcUrl);
  
  // Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log(`📊 Current Block: ${currentBlock}\n`);
  
  // Check contract addresses
  console.log('📋 Contract Addresses:');
  console.log(`   Factory (CONTRACT_ADDRESS): ${process.env['CONTRACT_ADDRESS']}`);
  console.log(`   Bonding Curve: ${process.env['BONDING_CURVE_ADDRESS']}`);
  console.log(`   WMON: ${process.env['WMON']}`);
  console.log();
  
  // Event signatures
  const curveCreateTopic = ethers.id('CurveCreate(address,address,address,string,string,string,uint256,uint256,uint256)');
  const curveBuyTopic = ethers.id('CurveBuy(address,address,uint256,uint256)');
  const curveSellTopic = ethers.id('CurveSell(address,address,uint256,uint256)');
  
  console.log('🔖 Event Topics:');
  console.log(`   CurveCreate: ${curveCreateTopic}`);
  console.log(`   CurveBuy: ${curveBuyTopic}`);
  console.log(`   CurveSell: ${curveSellTopic}`);
  console.log();
  
  // Check for recent events on factory
  console.log('🔍 Checking for recent events on Factory...');
  const factoryAddress = process.env['CONTRACT_ADDRESS'];
  
  if (!factoryAddress) {
    console.error('❌ CONTRACT_ADDRESS not set in .env!');
    return;
  }
  
  // Check last 100 blocks (RPC limit)
  const fromBlock = currentBlock - 100;
  
  console.log(`   Scanning blocks ${fromBlock} to ${currentBlock} (last 100 blocks)...\n`);
  
  try {
    // Check for CurveCreate events
    console.log('   Checking for CurveCreate events...');
    const createLogs = await provider.getLogs({
      fromBlock,
      toBlock: currentBlock,
      address: factoryAddress,
      topics: [curveCreateTopic]
    });
    console.log(`   ✅ Found ${createLogs.length} CurveCreate events`);
    
    if (createLogs.length > 0) {
      const latestCreate = createLogs[createLogs.length - 1];
      console.log(`      Latest: Block ${latestCreate?.blockNumber}, Tx ${latestCreate?.transactionHash}`);
    }
    console.log();
    
    // Check for CurveBuy events
    console.log('   Checking for CurveBuy events...');
    const buyLogs = await provider.getLogs({
      fromBlock,
      toBlock: currentBlock,
      address: factoryAddress,
      topics: [curveBuyTopic]
    });
    console.log(`   ✅ Found ${buyLogs.length} CurveBuy events`);
    
    if (buyLogs.length > 0) {
      const latestBuy = buyLogs[buyLogs.length - 1];
      console.log(`      Latest: Block ${latestBuy?.blockNumber}, Tx ${latestBuy?.transactionHash}`);
    }
    console.log();
    
    // Check for CurveSell events
    console.log('   Checking for CurveSell events...');
    const sellLogs = await provider.getLogs({
      fromBlock,
      toBlock: currentBlock,
      address: factoryAddress,
      topics: [curveSellTopic]
    });
    console.log(`   ✅ Found ${sellLogs.length} CurveSell events`);
    
    if (sellLogs.length > 0) {
      const latestSell = sellLogs[sellLogs.length - 1];
      console.log(`      Latest: Block ${latestSell?.blockNumber}, Tx ${latestSell?.transactionHash}`);
    }
    console.log();
    
    // Check for ANY events on factory
    console.log('   Checking for ANY events on factory...');
    const allLogs = await provider.getLogs({
      fromBlock,
      toBlock: currentBlock,
      address: factoryAddress
    });
    console.log(`   ✅ Found ${allLogs.length} total events on factory`);
    console.log();
    
    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 DIAGNOSIS SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    
    const totalEvents = createLogs.length + buyLogs.length + sellLogs.length;
    
    if (totalEvents === 0) {
      console.log('❌ NO EVENTS FOUND IN LAST 1000 BLOCKS');
      console.log();
      console.log('Possible causes:');
      console.log('1. Wrong factory address in CONTRACT_ADDRESS');
      console.log('2. No trading activity on NAD.FUN');
      console.log('3. Events are emitted from bonding curve contracts, not factory');
      console.log();
      console.log('Next steps:');
      console.log('1. Verify factory address with NAD.FUN team');
      console.log('2. Check if events come from individual bonding curve contracts');
      console.log('3. Scan bonding curve addresses from database');
    } else {
      console.log(`✅ FOUND ${totalEvents} EVENTS`);
      console.log(`   - ${createLogs.length} token creations`);
      console.log(`   - ${buyLogs.length} buy trades`);
      console.log(`   - ${sellLogs.length} sell trades`);
      console.log();
      console.log('✅ Factory address is correct and events are being emitted!');
      console.log();
      console.log('If tracker is not detecting these events, check:');
      console.log('1. Tracker is monitoring the correct address');
      console.log('2. Event topic hashes match');
      console.log('3. Block range being scanned');
    }
    
    console.log('═══════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Error checking for events:', error);
  }
  
  // Check bonding curve contracts
  console.log('\n🔍 Checking bonding curve contracts from database...');
  
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const tokens = await prisma.monadLaunchedToken.findMany({
      where: { bondingCurve: { not: 'unknown' } },
      select: { bondingCurve: true, name: true, symbol: true },
      take: 5,
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`   Found ${tokens.length} recent tokens with bonding curves`);
    
    if (tokens.length > 0) {
      console.log('\n   Checking for events on bonding curves...');
      
      for (const token of tokens) {
        console.log(`\n   Token: ${token.name} (${token.symbol})`);
        console.log(`   Bonding Curve: ${token.bondingCurve}`);
        
        const curveLogs = await provider.getLogs({
          fromBlock: currentBlock - 100,
          toBlock: currentBlock,
          address: token.bondingCurve,
          topics: [[curveBuyTopic, curveSellTopic]]
        });
        
        console.log(`   Events: ${curveLogs.length} trades`);
      }
    }
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('   ❌ Error checking bonding curves:', error);
  }
}

// Run diagnostic
diagnoseTrackerIssue().catch(error => {
  console.error('❌ Diagnostic failed:', error);
  process.exit(1);
});
