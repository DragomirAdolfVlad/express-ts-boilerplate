/**
 * Test Redis Caching Layer
 * 
 * This script tests the Redis caching implementation for the Token API
 * Tests cache hit/miss, invalidation, and warming functionality
 */

import { PrismaClient } from '@prisma/client';
import { redisTrackerCache } from '../src/services/redis/tracker-cache.service';
import { TokensService } from '../src/services/tokens/tokens.service';
import { HoldersService } from '../src/services/tokens/holders.service';
import { TradersService } from '../src/services/tokens/traders.service';
import { MonadTokenRepositoryImpl } from '../src/infrastructure/database/monad-token.repository';

async function testCaching() {
  console.log('🧪 Testing Redis Caching Layer\n');
  
  const prisma = new PrismaClient();
  const repository = new MonadTokenRepositoryImpl(prisma);
  const tokensService = new TokensService(repository, redisTrackerCache);
  const holdersService = new HoldersService(repository, redisTrackerCache);
  const tradersService = new TradersService(repository, redisTrackerCache);
  
  try {
    // Initialize Redis
    await redisTrackerCache.initialize();
    console.log('✅ Redis initialized\n');
    
    // Get a test token
    const tokens = await prisma.monadLaunchedToken.findMany({
      take: 1,
      orderBy: { timestamp: 'desc' }
    });
    
    if (tokens.length === 0) {
      console.log('❌ No tokens found in database');
      return;
    }
    
    const testToken = tokens[0].token;
    console.log(`📍 Test token: ${testToken}\n`);
    
    // Test 1: Token Overview Caching
    console.log('Test 1: Token Overview Caching');
    console.log('─────────────────────────────────');
    
    // Clear cache first
    await redisTrackerCache.invalidateTokenWithStats(testToken);
    
    // First call (cache miss)
    const start1 = Date.now();
    const overview1 = await tokensService.getTokenOverview(testToken);
    const duration1 = Date.now() - start1;
    console.log(`  First call (cache miss): ${duration1}ms`);
    
    // Second call (cache hit)
    const start2 = Date.now();
    const overview2 = await tokensService.getTokenOverview(testToken);
    const duration2 = Date.now() - start2;
    console.log(`  Second call (cache hit): ${duration2}ms`);
    
    const speedup = (duration1 / duration2).toFixed(2);
    console.log(`  ⚡ Speedup: ${speedup}x faster\n`);
    
    // Test 2: Holder Rankings Caching
    console.log('Test 2: Holder Rankings Caching');
    console.log('─────────────────────────────────');
    
    // Clear cache first
    await redisTrackerCache.invalidateRankings(testToken);
    
    // First call (cache miss)
    const start3 = Date.now();
    const holders1 = await holdersService.getTokenHolders(testToken);
    const duration3 = Date.now() - start3;
    console.log(`  First call (cache miss): ${duration3}ms`);
    console.log(`  Holders found: ${holders1.length}`);
    
    // Second call (cache hit)
    const start4 = Date.now();
    const holders2 = await holdersService.getTokenHolders(testToken);
    const duration4 = Date.now() - start4;
    console.log(`  Second call (cache hit): ${duration4}ms`);
    
    const speedup2 = (duration3 / duration4).toFixed(2);
    console.log(`  ⚡ Speedup: ${speedup2}x faster\n`);
    
    // Test 3: Trader Rankings Caching
    console.log('Test 3: Trader Rankings Caching');
    console.log('─────────────────────────────────');
    
    // Clear cache first
    await redisTrackerCache.invalidateRankings(testToken);
    
    // First call (cache miss)
    const start5 = Date.now();
    const traders1 = await tradersService.getTokenTraders(testToken);
    const duration5 = Date.now() - start5;
    console.log(`  First call (cache miss): ${duration5}ms`);
    console.log(`  Traders found: ${traders1.length}`);
    
    // Second call (cache hit)
    const start6 = Date.now();
    const traders2 = await tradersService.getTokenTraders(testToken);
    const duration6 = Date.now() - start6;
    console.log(`  Second call (cache hit): ${duration6}ms`);
    
    const speedup3 = (duration5 / duration6).toFixed(2);
    console.log(`  ⚡ Speedup: ${speedup3}x faster\n`);
    
    // Test 4: Cache Invalidation
    console.log('Test 4: Cache Invalidation');
    console.log('─────────────────────────────────');
    
    // Cache some data
    await tokensService.getTokenOverview(testToken);
    await holdersService.getTokenHolders(testToken);
    await tradersService.getTokenTraders(testToken);
    console.log('  ✅ Data cached');
    
    // Invalidate
    await redisTrackerCache.invalidateTokenWithStats(testToken);
    await redisTrackerCache.invalidateRankings(testToken);
    console.log('  ✅ Cache invalidated');
    
    // Verify cache miss
    const cachedToken = await redisTrackerCache.getTokenWithStats(testToken);
    const cachedHolders = await redisTrackerCache.getHolderRankings(testToken);
    const cachedTraders = await redisTrackerCache.getTraderRankings(testToken);
    
    if (!cachedToken && !cachedHolders && !cachedTraders) {
      console.log('  ✅ Cache successfully cleared\n');
    } else {
      console.log('  ❌ Cache not fully cleared\n');
    }
    
    // Test 5: Cache Warming
    console.log('Test 5: Cache Warming');
    console.log('─────────────────────────────────');
    
    const topTokens = await prisma.monadLaunchedToken.findMany({
      take: 10,
      orderBy: { timestamp: 'desc' },
      include: {
        metadata: true,
        tokenStats: true
      }
    });
    
    const tokensWithStats = topTokens.map((token: any) => ({
      address: token.token,
      name: token.name || 'Unknown',
      symbol: token.symbol || 'UNKNOWN',
      creator: token.creator,
      bondingCurve: token.bondingCurve,
      timestamp: token.timestamp,
      metadata: token.metadata,
      stats: {
        totalVolume: Number(token.tokenStats?.totalUsdVolume || 0),
        totalTrades: token.tokenStats?.totalTxCount || 0,
        buyCount: token.tokenStats?.buyCount || 0,
        sellCount: token.tokenStats?.sellCount || 0,
        marketCap: 0,
        liquidityUsd: 0,
        curveProgress: 0,
        lastTradeTime: token.tokenStats?.lastTradeTime || new Date(),
        proposedTrades: token.tokenStats?.proposedTrades || 0,
        finalizedTrades: token.tokenStats?.finalizedTrades || 0,
        verifiedTrades: token.tokenStats?.verifiedTrades || 0
      }
    }));
    
    const warmStart = Date.now();
    await redisTrackerCache.warmCacheWithTopTokens(tokensWithStats, 10);
    const warmDuration = Date.now() - warmStart;
    console.log(`  ✅ Warmed cache with 10 tokens in ${warmDuration}ms\n`);
    
    // Test 6: Health Check
    console.log('Test 6: Redis Health Check');
    console.log('─────────────────────────────────');
    
    const health = await redisTrackerCache.healthCheck();
    console.log(`  Healthy: ${health.healthy}`);
    console.log(`  Latency: ${health.latency}ms\n`);
    
    console.log('✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await redisTrackerCache.disconnect();
    await prisma.$disconnect();
  }
}

// Run tests
testCaching().catch(console.error);
