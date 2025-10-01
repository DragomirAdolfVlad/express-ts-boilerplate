#!/usr/bin/env ts-node

/**
 * Advanced Real-Time Metrics Monitor for Monad Token Tracker
 * Monitors RPC requests, latency, processing times, and system performance
 */

import { PrismaClient } from '@prisma/client';
import { JsonRpcProvider } from 'ethers';
import { sharedMetrics } from '../src/utils/shared-metrics';

const prisma = new PrismaClient();

interface AdvancedMetrics {
  // RPC Metrics
  rpc: {
    totalRequests: number;
    requestsPerSecond: number;
    averageLatency: number;
    currentLatency: number;
    failedRequests: number;
    successRate: number;
    methodBreakdown: Record<string, number>;
    rateLimitErrors: number;
  };
  
  // Processing Metrics
  processing: {
    blocksProcessed: number;
    blocksPerSecond: number;
    averageBlockTime: number;
    currentBlockTime: number;
    eventsProcessed: number;
    eventsPerSecond: number;
    decodingLatency: number;
    databaseLatency: number;
  };
  
  // Business Metrics
  business: {
    totalTrades: number;
    tradesPerMinute: number;
    totalTokens: number;
    tokensPerHour: number;
    recentTrades: number;
    recentTokens: number;
    lastActivity: Date | null;
  };
  
  // System Health
  system: {
    uptime: number;
    memoryUsage: number;
    cpuUsage: number;
    errorRate: number;
    cacheHitRate: number;
    queueSize: number;
  };
}

class MetricsCollector {
  private startTime = Date.now();
  private rpcRequests: Array<{ timestamp: number; latency: number; method: string; success: boolean }> = [];
  private blockProcessing: Array<{ timestamp: number; latency: number; events: number }> = [];
  // Removed unused lastMetrics property
  private provider: JsonRpcProvider;
  
  constructor() {
    this.provider = new JsonRpcProvider(process.env['MONAD_HTTP_URL']);
    this.startRPCMonitoring();
  }
  
  private startRPCMonitoring() {
    // Monkey patch the provider to track RPC calls
    const originalSend = this.provider.send.bind(this.provider);
    this.provider.send = async (method: string, params: any[]) => {
      const startTime = Date.now();
      try {
        const result = await originalSend(method, params);
        const latency = Date.now() - startTime;
        this.recordRPCCall(method, latency, true);
        return result;
      } catch (error) {
        const latency = Date.now() - startTime;
        this.recordRPCCall(method, latency, false);
        throw error;
      }
    };
  }
  
  private recordRPCCall(method: string, latency: number, success: boolean) {
    this.rpcRequests.push({
      timestamp: Date.now(),
      latency,
      method,
      success
    });
    
    // Keep only last 1000 requests
    if (this.rpcRequests.length > 1000) {
      this.rpcRequests = this.rpcRequests.slice(-1000);
    }
  }
  
  recordBlockProcessing(latency: number, events: number) {
    this.blockProcessing.push({
      timestamp: Date.now(),
      latency,
      events
    });
    
    // Keep only last 100 blocks
    if (this.blockProcessing.length > 100) {
      this.blockProcessing = this.blockProcessing.slice(-100);
    }
  }
  
  async collectMetrics(): Promise<AdvancedMetrics> {
    const now = Date.now();
    // Removed unused oneMinuteAgo variable
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Get real metrics from the tracker via shared file system
    const realMetrics = sharedMetrics.getRecentMetrics(60000); // Last minute
    
    // RPC Metrics from real data
    const recentRPCCalls = realMetrics.rpcCalls;
    const successfulRPCCalls = recentRPCCalls.filter(r => r.success);
    const failedRPCCalls = recentRPCCalls.filter(r => !r.success);
    
    const methodBreakdown: Record<string, number> = {};
    recentRPCCalls.forEach(call => {
      methodBreakdown[call.method] = (methodBreakdown[call.method] || 0) + 1;
    });
    
    const rpcLatencies = successfulRPCCalls.map(r => r.latency);
    const avgRPCLatency = rpcLatencies.length > 0 ? rpcLatencies.reduce((a, b) => a + b, 0) / rpcLatencies.length : 0;
    const currentRPCLatency = rpcLatencies.length > 0 ? rpcLatencies[rpcLatencies.length - 1] : 0;
    
    // Processing Metrics from real data
    const recentBlocks = realMetrics.blockProcessing;
    const blockLatencies = recentBlocks.map(b => b.latency);
    const avgBlockTime = blockLatencies.length > 0 ? blockLatencies.reduce((a, b) => a + b, 0) / blockLatencies.length : 0;
    const currentBlockTime = blockLatencies.length > 0 ? blockLatencies[blockLatencies.length - 1] : 0;
    const totalEvents = recentBlocks.reduce((sum, b) => sum + b.events, 0);
    
    // Database Metrics from real data
    const recentDbOps = realMetrics.databaseOperations;
    const dbLatencies = recentDbOps.map(op => op.latency);
    const avgDbLatency = dbLatencies.length > 0 ? dbLatencies.reduce((a, b) => a + b, 0) / dbLatencies.length : 0;
    
    // Database Metrics
    const [totalTrades, totalTokens, recentTrades, recentTokens, lastTrade] = await Promise.all([
      prisma.monadTokenTrade.count(),
      prisma.monadLaunchedToken.count(),
      prisma.monadTokenTrade.count({
        where: { timestamp: { gte: new Date(oneHourAgo) } }
      }),
      prisma.monadLaunchedToken.count({
        where: { timestamp: { gte: new Date(oneHourAgo) } }
      }),
      prisma.monadTokenTrade.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true }
      })
    ]);
    
    // System Metrics
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;
    
    const metrics: AdvancedMetrics = {
      rpc: {
        totalRequests: this.rpcRequests.length,
        requestsPerSecond: recentRPCCalls.length / 60,
        averageLatency: Math.round(avgRPCLatency),
        currentLatency: Math.round(currentRPCLatency || 0),
        failedRequests: failedRPCCalls.length,
        successRate: recentRPCCalls.length > 0 ? (successfulRPCCalls.length / recentRPCCalls.length) * 100 : 100,
        methodBreakdown,
        rateLimitErrors: failedRPCCalls.filter(r => r.method.includes('rate')).length
      },
      
      processing: {
        blocksProcessed: this.blockProcessing.length,
        blocksPerSecond: recentBlocks.length / 60,
        averageBlockTime: Math.round(avgBlockTime),
        currentBlockTime: Math.round(currentBlockTime || 0),
        eventsProcessed: totalEvents,
        eventsPerSecond: totalEvents / 60,
        decodingLatency: Math.round(avgBlockTime * 0.3), // Estimate 30% of block time
        databaseLatency: Math.round(avgDbLatency) // Real database latency
      },
      
      business: {
        totalTrades,
        tradesPerMinute: recentTrades / 60,
        totalTokens,
        tokensPerHour: recentTokens,
        recentTrades,
        recentTokens,
        lastActivity: lastTrade?.timestamp || null
      },
      
      system: {
        uptime: Math.round(uptime / 1000),
        memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024),
        cpuUsage: 0, // Would need additional monitoring
        errorRate: recentRPCCalls.length > 0 ? (failedRPCCalls.length / recentRPCCalls.length) * 100 : 0,
        cacheHitRate: 0, // Would need cache monitoring
        queueSize: 0 // Would need queue monitoring
      }
    };
    
    // Metrics collected successfully
    return metrics;
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function getStatusColor(value: number, thresholds: { good: number; warning: number }): string {
  if (value <= thresholds.good) return '🟢';
  if (value <= thresholds.warning) return '🟡';
  return '🔴';
}

function displayMetrics(metrics: AdvancedMetrics) {
  console.clear();
  console.log('🚀 MONAD TOKEN TRACKER - ADVANCED METRICS DASHBOARD');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  
  // RPC Performance
  console.log('📡 RPC PERFORMANCE:');
  console.log(`   Requests/sec: ${getStatusColor(metrics.rpc.requestsPerSecond, {good: 5, warning: 20})} ${metrics.rpc.requestsPerSecond.toFixed(1)}`);
  console.log(`   Avg Latency:  ${getStatusColor(metrics.rpc.averageLatency, {good: 100, warning: 500})} ${metrics.rpc.averageLatency}ms`);
  console.log(`   Current:      ${getStatusColor(metrics.rpc.currentLatency, {good: 100, warning: 500})} ${metrics.rpc.currentLatency}ms`);
  console.log(`   Success Rate: ${getStatusColor(100 - metrics.rpc.successRate, {good: 1, warning: 5})} ${metrics.rpc.successRate.toFixed(1)}%`);
  console.log(`   Failed:       ${metrics.rpc.failedRequests} requests`);
  console.log('');
  
  // RPC Method Breakdown
  if (Object.keys(metrics.rpc.methodBreakdown).length > 0) {
    console.log('📊 RPC METHODS (last minute):');
    Object.entries(metrics.rpc.methodBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([method, count]) => {
        console.log(`   ${method.padEnd(20)}: ${count}`);
      });
    console.log('');
  }
  
  // Processing Performance
  console.log('⚡ PROCESSING PERFORMANCE:');
  console.log(`   Blocks/sec:   ${getStatusColor(metrics.processing.blocksPerSecond, {good: 2, warning: 0.5})} ${metrics.processing.blocksPerSecond.toFixed(2)}`);
  console.log(`   Block Time:   ${getStatusColor(metrics.processing.averageBlockTime, {good: 200, warning: 1000})} ${metrics.processing.averageBlockTime}ms avg`);
  console.log(`   Current:      ${getStatusColor(metrics.processing.currentBlockTime, {good: 200, warning: 1000})} ${metrics.processing.currentBlockTime}ms`);
  console.log(`   Events/sec:   ${metrics.processing.eventsPerSecond.toFixed(1)}`);
  console.log(`   Decoding:     ~${metrics.processing.decodingLatency}ms`);
  console.log(`   Database:     ~${metrics.processing.databaseLatency}ms`);
  console.log('');
  
  // Business Metrics
  console.log('💼 BUSINESS METRICS:');
  console.log(`   Total Trades: ${formatNumber(metrics.business.totalTrades)}`);
  console.log(`   Total Tokens: ${formatNumber(metrics.business.totalTokens)}`);
  console.log(`   Trades/min:   ${metrics.business.tradesPerMinute.toFixed(1)}`);
  console.log(`   Tokens/hour:  ${metrics.business.tokensPerHour}`);
  console.log(`   Last Activity: ${metrics.business.lastActivity ? formatDuration(Math.floor((Date.now() - metrics.business.lastActivity.getTime()) / 1000)) + ' ago' : 'Never'}`);
  console.log('');
  
  // System Health
  console.log('🖥️  SYSTEM HEALTH:');
  console.log(`   Uptime:       ${formatDuration(metrics.system.uptime)}`);
  console.log(`   Memory:       ${getStatusColor(metrics.system.memoryUsage, {good: 100, warning: 500})} ${metrics.system.memoryUsage}MB`);
  console.log(`   Error Rate:   ${getStatusColor(metrics.system.errorRate, {good: 1, warning: 5})} ${metrics.system.errorRate.toFixed(1)}%`);
  console.log('');
  
  // Status Summary
  const overallStatus = 
    metrics.rpc.successRate > 95 && 
    metrics.rpc.averageLatency < 500 && 
    metrics.processing.averageBlockTime < 1000 &&
    metrics.system.errorRate < 5 ? '🟢 EXCELLENT' :
    metrics.rpc.successRate > 90 && 
    metrics.rpc.averageLatency < 1000 && 
    metrics.processing.averageBlockTime < 2000 &&
    metrics.system.errorRate < 10 ? '🟡 GOOD' : '🔴 NEEDS ATTENTION';
  
  console.log(`🎯 OVERALL STATUS: ${overallStatus}`);
  console.log(`   Updated: ${new Date().toLocaleTimeString()}`);
  console.log('');
  console.log('Press Ctrl+C to exit');
}

async function testRPCConnection(): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(process.env['MONAD_HTTP_URL']);
    await provider.getBlockNumber();
    return true;
  } catch (error) {
    console.error('❌ RPC Connection failed:', error);
    return false;
  }
}

async function main() {
  console.log('🔄 Starting Advanced Metrics Monitor...');
  
  // Test connections
  const rpcConnected = await testRPCConnection();
  if (!rpcConnected) {
    console.error('❌ Cannot connect to RPC. Please check your MONAD_HTTP_URL');
    process.exit(1);
  }
  
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
  
  const collector = new MetricsCollector();
  const updateInterval = 2000; // 2 seconds
  
  const update = async () => {
    try {
      const metrics = await collector.collectMetrics();
      displayMetrics(metrics);
    } catch (error) {
      console.error('❌ Error collecting metrics:', error);
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
  
  // Real metrics will be collected from the running tracker
}

if (require.main === module) {
  main().catch(console.error);
}