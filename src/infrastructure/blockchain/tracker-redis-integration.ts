/**
 * Redis Integration Layer for Optimized Tracker
 * 
 * Connects the OptimizedTokenCreationTracker with Redis cache
 * for real-time updates and ultra-fast data access
 */

import { PrismaClient } from '@prisma/client';
import { redisTrackerCache } from '../../services/redis/tracker-cache.service';

export class TrackerRedisIntegration {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initialize Redis integration
   */
  async initialize(): Promise<void> {
    try {
      await redisTrackerCache.initialize();
      console.log('✅ Redis tracker integration initialized');
      
      // Set up event listeners for real-time broadcasting
      this.setupEventListeners();
    } catch (error) {
      console.error('❌ Failed to initialize Redis integration:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for WebSocket broadcasting
   */
  private setupEventListeners(): void {
    // Listen for token created events
    redisTrackerCache.onTokenCreated((token) => {
      console.log(`📡 Token created event: ${token.name} (${token.symbol})`);
      // WebSocket broadcast would go here
    });

    // Listen for trade executed events
    redisTrackerCache.onTradeExecuted((trade) => {
      console.log(`📡 Trade executed: ${trade.isBuy ? 'BUY' : 'SELL'} ${trade.tokenAddress}`);
      // WebSocket broadcast would go here
    });

    // Listen for price updates
    redisTrackerCache.onPriceUpdate((data) => {
      console.log(`📡 Price update: ${data.tokenAddress} = ${data.price}`);
      // WebSocket broadcast would go here
    });
  }

  /**
   * Cache token when detected from blockchain
   */
  async cacheTokenFromEvent(token: {
    tokenAddress: string;
    name: string;
    symbol: string;
    creator: string;
    bondingCurve: string;
    blockNumber: string;
    blockHash: string;
    timestamp: Date;
    transactionHash: string;
    metadataId?: number;
  }): Promise<void> {
    try {
      // Fetch metadata if available
      let metadata;
      if (token.metadataId) {
        const metadataRecord = await this.prisma.monadTokenMetadata.findUnique({
          where: { id: token.metadataId },
        });
        
        if (metadataRecord) {
          metadata = {
            description: metadataRecord.description || undefined,
            image: metadataRecord.image || undefined,
            website: metadataRecord.website ? JSON.stringify(metadataRecord.website) : undefined,
            twitter: metadataRecord.twitter || undefined,
            telegram: metadataRecord.telegram || undefined,
          };
        }
      }

      // Cache in Redis
      await redisTrackerCache.cacheToken({
        tokenAddress: token.tokenAddress,
        name: token.name,
        symbol: token.symbol,
        creator: token.creator,
        bondingCurve: token.bondingCurve,
        blockNumber: token.blockNumber,
        timestamp: token.timestamp,
        metadata,
      });
    } catch (error) {
      console.error('Failed to cache token in Redis:', error);
      // Don't throw - Redis cache is optional
    }
  }

  /**
   * Cache trade when detected from blockchain
   */
  async cacheTradeFromEvent(trade: {
    uniqueTradeId: string;
    tokenAddress: string;
    trader: string;
    isBuy: boolean;
    ethAmount: string;
    tokenAmount: string;
    pricePerToken: string;
    blockNumber: string;
    timestamp: Date;
  }): Promise<void> {
    try {
      await redisTrackerCache.cacheTrade(trade);
    } catch (error) {
      console.error('Failed to cache trade in Redis:', error);
      // Don't throw - Redis cache is optional
    }
  }

  /**
   * Batch cache tokens (for backfill)
   */
  async cacheTokensBatch(tokens: any[]): Promise<void> {
    try {
      const tokenData = await Promise.all(
        tokens.map(async (token) => {
          let metadata;
          if (token.metadataId) {
            const metadataRecord = await this.prisma.monadTokenMetadata.findUnique({
              where: { id: token.metadataId },
            });
            
            if (metadataRecord) {
              metadata = {
                description: metadataRecord.description || undefined,
                image: metadataRecord.image || undefined,
                website: metadataRecord.website ? JSON.stringify(metadataRecord.website) : undefined,
                twitter: metadataRecord.twitter || undefined,
                telegram: metadataRecord.telegram || undefined,
              };
            }
          }

          return {
            tokenAddress: token.tokenAddress,
            name: token.name,
            symbol: token.symbol,
            creator: token.creator,
            bondingCurve: token.bondingCurve,
            blockNumber: token.blockNumber,
            timestamp: new Date(token.timestamp),
            metadata,
          };
        })
      );

      await redisTrackerCache.cacheTokensBatch(tokenData);
      console.log(`💾 Batch cached ${tokens.length} tokens in Redis`);
    } catch (error) {
      console.error('Failed to batch cache tokens:', error);
    }
  }

  /**
   * Batch cache trades (for backfill)
   */
  async cacheTradesBatch(trades: any[]): Promise<void> {
    try {
      const tradeData = trades.map((trade) => ({
        uniqueTradeId: trade.uniqueTradeId,
        tokenAddress: trade.tokenAddress,
        trader: trade.trader,
        isBuy: trade.isBuy,
        ethAmount: trade.ethAmount,
        tokenAmount: trade.tokenAmount,
        pricePerToken: trade.pricePerToken || '0',
        blockNumber: trade.blockNumber,
        timestamp: new Date(trade.timestamp),
      }));

      await redisTrackerCache.cacheTradesBatch(tradeData);
      console.log(`💰 Batch cached ${trades.length} trades in Redis`);
    } catch (error) {
      console.error('Failed to batch cache trades:', error);
    }
  }

  /**
   * Backfill Redis cache from database
   */
  async backfillCache(options: {
    tokenLimit?: number;
    tradeLimit?: number;
  } = {}): Promise<void> {
    console.log('🔄 Starting Redis cache backfill...');
    
    try {
      // Backfill recent tokens
      const tokens = await this.prisma.monadLaunchedToken.findMany({
        take: options.tokenLimit || 1000,
        orderBy: { timestamp: 'desc' },
      });
      
      if (tokens.length > 0) {
        await this.cacheTokensBatch(tokens);
      }

      // Backfill recent trades
      const trades = await this.prisma.monadTokenTrade.findMany({
        take: options.tradeLimit || 5000,
        orderBy: { timestamp: 'desc' },
      });
      
      if (trades.length > 0) {
        await this.cacheTradesBatch(trades);
      }

      // Update global stats
      const [tokenCount, tradeCount] = await Promise.all([
        this.prisma.monadLaunchedToken.count(),
        this.prisma.monadTokenTrade.count(),
      ]);

      const volumeResult = await this.prisma.monadTokenTrade.aggregate({
        _sum: { wmonAmount: true },
      });

      await redisTrackerCache.updateGlobalStats({
        totalTokens: tokenCount,
        totalTrades: tradeCount,
        totalVolume: volumeResult._sum?.wmonAmount?.toString() || '0',
        activeUsers: 0, // Would count from trades
      });

      console.log('✅ Redis cache backfill complete');
      console.log(`   📊 Tokens: ${tokens.length}`);
      console.log(`   💰 Trades: ${trades.length}`);
    } catch (error) {
      console.error('❌ Redis backfill failed:', error);
    }
  }

  /**
   * Get token from cache (with database fallback)
   */
  async getToken(tokenAddress: string): Promise<any> {
    // Try Redis first
    const cached = await redisTrackerCache.getToken(tokenAddress);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const token = await this.prisma.monadLaunchedToken.findUnique({
      where: { token: tokenAddress },
      include: { metadata: true },
    });

    if (token) {
      // Cache for next time
      await this.cacheTokenFromEvent(token as any);
    }

    return token;
  }

  /**
   * Get recent tokens from cache (with database fallback)
   */
  async getRecentTokens(limit: number = 50): Promise<any[]> {
    try {
      const cached = await redisTrackerCache.getRecentTokens(limit);
      if (cached.length > 0) {
        return cached;
      }
    } catch (error) {
      console.warn('Redis cache miss, falling back to database');
    }

    // Fallback to database
    return await this.prisma.monadLaunchedToken.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: { metadata: true },
    });
  }

  /**
   * Get token trades from cache (with database fallback)
   */
  async getTokenTrades(tokenAddress: string, limit: number = 50): Promise<any[]> {
    try {
      const cached = await redisTrackerCache.getTokenTrades(tokenAddress, limit);
      if (cached.length > 0) {
        return cached;
      }
    } catch (error) {
      console.warn('Redis cache miss, falling back to database');
    }

    // Fallback to database
    return await this.prisma.monadTokenTrade.findMany({
      where: { tokenAddress },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get price history for charts
   */
  async getPriceHistory(
    tokenAddress: string,
    timeRange: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<any[]> {
    return await redisTrackerCache.getPriceHistory(tokenAddress, timeRange);
  }

  /**
   * Get leaderboards
   */
  async getLeaderboards(): Promise<any> {
    const [topByVolume, topByTrades, topTraders] = await Promise.all([
      redisTrackerCache.getTopTokensByVolume(10),
      redisTrackerCache.getTopTokensByTrades(10),
      redisTrackerCache.getTopTraders(10),
    ]);

    return {
      topByVolume,
      topByTrades,
      topTraders,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<any> {
    return await redisTrackerCache.healthCheck();
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    await redisTrackerCache.disconnect();
    console.log('👋 Redis tracker integration shutdown');
  }
}
