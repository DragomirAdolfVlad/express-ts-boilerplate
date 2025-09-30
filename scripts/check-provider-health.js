#!/usr/bin/env node

/**
 * Provider Health Check
 * 
 * Verify RPC connectivity before starting the application
 */

const { JsonRpcProvider, WebSocketProvider } = require('ethers');
require('dotenv').config();

async function checkProviderHealth() {
  console.log('=== BLOCKCHAIN PROVIDER HEALTH CHECK ===\n');
  
  const httpUrl = process.env.MONAD_HTTP_URL;
  const wsUrl = process.env.MONAD_WS_URL;
  const chainId = process.env.MONAD_CHAIN_ID || 10143;
  
  console.log(`HTTP RPC: ${httpUrl}`);
  console.log(`WS RPC: ${wsUrl}`);
  console.log(`Expected Chain ID: ${chainId}\n`);
  
  // Test HTTP provider
  console.log('🔍 Testing HTTP provider...');
  try {
    const provider = new JsonRpcProvider(httpUrl, {
      chainId: Number(chainId),
      name: 'monad-testnet'
    });
    
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    
    console.log(`✅ HTTP Provider: Connected`);
    console.log(`   Chain ID: ${network.chainId}`);
    console.log(`   Block Number: ${blockNumber}`);
    console.log(`   Network Name: ${network.name}`);
    
  } catch (error) {
    console.error(`❌ HTTP Provider failed:`, error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('   DNS resolution failed - check your RPC URL');
    } else if (error.message.includes('detectNetwork')) {
      console.error('   Network detection failed - check chain ID');
    }
    
    return false;
  }
  
  // Test WebSocket provider (if configured)
  if (wsUrl) {
    console.log('\n🔍 Testing WebSocket provider...');
    try {
      const { WebSocketProvider } = require('ethers');
      const wsProvider = new WebSocketProvider(wsUrl, {
        chainId: Number(chainId),
        name: 'monad-testnet'
      });
      
      const network = await wsProvider.getNetwork();
      console.log(`✅ WebSocket Provider: Connected`);
      console.log(`   Chain ID: ${network.chainId}`);
      
      // Clean up
      wsProvider.destroy();
      
    } catch (error) {
      console.error(`❌ WebSocket Provider failed:`, error.message);
    }
  }
  
  console.log('\n=== RECOMMENDATIONS ===');
  console.log('✅ Provider health check passed');
  console.log('🚀 Ready to run token metadata fetching');
  console.log('📊 Run: node scripts/fetch-token-metadata-fixed.js');
  
  return true;
}

checkProviderHealth().catch(console.error);