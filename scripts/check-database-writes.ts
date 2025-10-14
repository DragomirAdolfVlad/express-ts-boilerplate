/**
 * Check Database Writes
 * 
 * Verifies that trades are actually being written to the database
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkDatabaseWrites() {
  console.log('🔍 Checking Database Writes...\n');
  
  const prisma = new PrismaClient();
  
  try {
    // Check total trades
    const totalTrades = await prisma.monadTokenTrade.count();
    console.log(`📊 Total Trades in DB: ${totalTrades}`);
    
    // Check trades from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTrades = await prisma.monadTokenTrade.count({
      where: {
        timestamp: { gte: oneHourAgo }
      }
    });
    console.log(`📊 Trades in Last Hour: ${recentTrades}`);
    
    // Check trades from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tradesLast24h = await prisma.monadTokenTrade.count({
      where: {
        timestamp: { gte: oneDayAgo }
      }
    });
    console.log(`📊 Trades in Last 24h: ${tradesLast24h}`);
    
    // Get most recent trades
    console.log('\n📋 Most Recent Trades:');
    const recentTradesList = await prisma.monadTokenTrade.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      select: {
        tokenAddress: true,
        trader: true,
        isBuy: true,
        wmonAmount: true,
        tokenAmount: true,
        timestamp: true,
        signature: true
      }
    });
    
    if (recentTradesList.length === 0) {
      console.log('   ❌ NO TRADES FOUND IN DATABASE!');
    } else {
      recentTradesList.forEach((trade, i) => {
        console.log(`\n   ${i + 1}. ${trade.isBuy ? 'BUY' : 'SELL'} - ${new Date(trade.timestamp).toISOString()}`);
        console.log(`      Token: ${trade.tokenAddress.slice(0, 10)}...`);
        console.log(`      Trader: ${trade.trader.slice(0, 10)}...`);
        console.log(`      WMON: ${trade.wmonAmount}`);
        console.log(`      Tokens: ${trade.tokenAmount}`);
        console.log(`      Tx: ${trade.signature?.slice(0, 20) || 'N/A'}...`);
      });
    }
    
    // Check total tokens
    console.log('\n📊 Token Statistics:');
    const totalTokens = await prisma.monadLaunchedToken.count();
    console.log(`   Total Tokens: ${totalTokens}`);
    
    const tokensLast24h = await prisma.monadLaunchedToken.count({
      where: {
        timestamp: { gte: oneDayAgo }
      }
    });
    console.log(`   Tokens in Last 24h: ${tokensLast24h}`);
    
    // Get most recent tokens
    console.log('\n📋 Most Recent Tokens:');
    const recentTokens = await prisma.monadLaunchedToken.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: {
        token: true,
        name: true,
        symbol: true,
        creator: true,
        timestamp: true,
        bondingCurve: true
      }
    });
    
    if (recentTokens.length === 0) {
      console.log('   ❌ NO TOKENS FOUND IN DATABASE!');
    } else {
      recentTokens.forEach((token, i) => {
        console.log(`\n   ${i + 1}. ${token.name} (${token.symbol}) - ${new Date(token.timestamp).toISOString()}`);
        console.log(`      Address: ${token.token}`);
        console.log(`      Creator: ${token.creator.slice(0, 10)}...`);
        console.log(`      Bonding Curve: ${token.bondingCurve}`);
      });
    }
    
    // Check if there are any trades for recent tokens
    if (recentTokens.length > 0) {
      console.log('\n🔍 Checking trades for recent tokens...');
      for (const token of recentTokens.slice(0, 3)) {
        const tokenTrades = await prisma.monadTokenTrade.count({
          where: { tokenAddress: token.token }
        });
        console.log(`   ${token.name}: ${tokenTrades} trades`);
      }
    }
    
    // Check for the specific token mentioned in logs
    const specificToken = '0x4851d40c0283A1b4fa3c0b41C05fDaCe5d4624fD';
    console.log(`\n🔍 Checking specific token: ${specificToken}`);
    
    const tokenExists = await prisma.monadLaunchedToken.findUnique({
      where: { token: specificToken }
    });
    
    if (tokenExists) {
      console.log('   ✅ Token exists in database');
      console.log(`      Name: ${tokenExists.name}`);
      console.log(`      Symbol: ${tokenExists.symbol}`);
      console.log(`      Created: ${tokenExists.timestamp}`);
      
      const tokenTrades = await prisma.monadTokenTrade.findMany({
        where: { tokenAddress: specificToken },
        orderBy: { timestamp: 'desc' }
      });
      
      console.log(`   Trades for this token: ${tokenTrades.length}`);
      if (tokenTrades.length > 0) {
        tokenTrades.forEach((trade, i) => {
          console.log(`      ${i + 1}. ${trade.isBuy ? 'BUY' : 'SELL'} - ${trade.timestamp}`);
        });
      }
    } else {
      console.log('   ❌ Token NOT found in database!');
      console.log('   This means the token creation event was NOT saved!');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run check
checkDatabaseWrites().catch(error => {
  console.error('❌ Check failed:', error);
  process.exit(1);
});
