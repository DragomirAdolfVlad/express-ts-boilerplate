#!/usr/bin/env ts-node

/**
 * Simple Metrics Monitor for Monad Token Tracker
 * Shows real-time performance metrics from the optimized tracker
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SimpleMetrics {
  totalTrades: number;
  totalTokens: number;
  recentTrades: number;
  recentTokens: number;
  lastTradeTime: Date | null;
  lastTokenTime: Date | null;
}

async function getMetrics(): Promise<SimpleMetrics> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [totalTrades, totalTokens, recentTrades, recentTokens, lastTrade, lastToken] = await Promise.all([
    // Total trades
    prisma.monadTokenTrade.count(),
    
    // Total tokens
    prisma.monadLaunchedToken.count(),
    
    // Recent trades (last hour)
    prisma.monadTokenTrade.count({
      where: {
        timestamp: {
          gte: oneHourAgo
        }
      }
    }),
    
    // Recent tokens (last hour)
    prisma.monadLaunchedToken.count({
      where: {
        timestamp: {
          gte: oneHourAgo
        }
      }
    }),
    
    // Last trade
    prisma.monadTokenTrade.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    }),
    
    // Last token
    prisma.monadLaunchedToken.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    })
  ]);

  return {
    totalTrades,
    totalTokens,
    recentTrades,
    recentTokens,
    lastTradeTime: lastTrade?.timestamp || null,
    lastTokenTime: lastToken?.timestamp || null
  };
}

function formatTime(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}

function displayMetrics(metrics: SimpleMetrics) {
  console.clear();
  console.log('🚀 MONAD TOKEN TRACKER - LIVE METRICS');
  console.log('=====================================');
  console.log('');
  console.log('📊 TOTALS:');
  console.log(`   Trades Tracked: ${metrics.totalTrades.toLocaleString()}`);
  console.log(`   Tokens Tracked: ${metrics.totalTokens.toLocaleString()}`);
  console.log('');
  console.log('⚡ LAST HOUR:');
  console.log(`   New Trades: ${metrics.recentTrades}`);
  console.log(`   New Tokens: ${metrics.recentTokens}`);
  console.log('');
  console.log('🕐 ACTIVITY:');
  console.log(`   Last Trade: ${formatTime(metrics.lastTradeTime)}`);
  console.log(`   Last Token: ${formatTime(metrics.lastTokenTime)}`);
  console.log('');
  console.log('💡 System Status: OPTIMIZED & RUNNING');
  console.log(`   Updated: ${new Date().toLocaleTimeString()}`);
  console.log('');
  console.log('Press Ctrl+C to exit');
}

async function main() {
  console.log('🔄 Starting Monad Token Tracker Metrics Monitor...');
  
  const updateInterval = 5000; // 5 seconds
  
  const update = async () => {
    try {
      const metrics = await getMetrics();
      displayMetrics(metrics);
    } catch (error) {
      console.error('❌ Error fetching metrics:', error);
    }
  };
  
  // Initial update
  await update();
  
  // Set up periodic updates
  const interval = setInterval(update, updateInterval);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down metrics monitor...');
    clearInterval(interval);
    prisma.$disconnect();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(console.error);
}