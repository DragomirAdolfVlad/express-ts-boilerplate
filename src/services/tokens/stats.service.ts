/**
 * StatsService - System statistics and monitoring
 * 
 * Handles all statistics-related operations including:
 * - Total tokens and trades count
 * - Volume aggregation (all-time and 24h)
 * - Tracker system stats
 * - Redis cache statistics
 */

import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';
import { RedisTrackerCache } from '../redis/tracker-cache.service';
import { MonadTrackerMain } from '../../infrastructure/blockchain/monad-tracker-main';

export interface ServiceStats {
  // Token statistics
  totalTokens: number;
  tokensCreated24h: number;
  
  // Trade statistics
  totalTrades: number;
  tradesProcessed24h: number;
  
  // Volume statistics
  totalVolumeUsd: number;
  volume24h: number;
  
  // Performance metrics
  avgProcessingLatency: number;
  
  // Redis statistics (optional)
  cacheHitRate?: number;
  redis?: {
    healthy: boolean;
    latency: number;
    cachedTokens: number;
    cachedTrades: number;
  };
  
  // Tracker statistics
  tracker?: {
    uptime: number;
    isRunning: boolean;
    dataQuality: number;
  };
  
  // Metadata
  serviceName: string;
  timestamp: Date;
}

export class StatsService {
  constructor(
    // @ts-ignore - Will be used in future implementation
    private readonly repository: MonadTokenRepository,
    // @ts-ignore - Will be used in future implementation
    private readonly cache: RedisTrackerCache,
    // @ts-ignore - Will be used in future implementation
    private readonly tracker: MonadTrackerMain
  ) {
    console.log('[StatsService] Initialized with repository, cache, and tracker');
  }

  /**
   * Get comprehensive service statistics
   * Requirements: 8
   */
  async getServiceStats(): Promise<ServiceStats> {
    console.log('[StatsService] Gathering service statistics...');
    
    try {
      // Get database statistics
      const dbStats = await this.getDatabaseStats();
      
      // Get Redis statistics if enabled
      const redisStats = await this.getRedisStats();
      
      // Get tracker statistics
      const trackerStats = await this.getTrackerStats();
      
      const stats: ServiceStats = {
        // Token statistics
        totalTokens: dbStats.totalTokens,
        tokensCreated24h: dbStats.tokensCreated24h,
        
        // Trade statistics
        totalTrades: dbStats.totalTrades,
        tradesProcessed24h: dbStats.tradesProcessed24h,
        
        // Volume statistics
        totalVolumeUsd: dbStats.totalVolumeUsd,
        volume24h: dbStats.volume24h,
        
        // Performance metrics
        avgProcessingLatency: trackerStats.avgLatency,
        
        // Redis statistics
        cacheHitRate: redisStats?.cacheHitRate,
        redis: redisStats ? {
          healthy: redisStats.healthy,
          latency: redisStats.latency,
          cachedTokens: redisStats.cachedTokens,
          cachedTrades: redisStats.cachedTrades
        } : undefined,
        
        // Tracker statistics
        tracker: {
          uptime: trackerStats.uptime,
          isRunning: trackerStats.isRunning,
          dataQuality: trackerStats.dataQuality
        },
        
        // Metadata
        serviceName: 'Monad Token API',
        timestamp: new Date()
      };
      
      console.log('[StatsService] Statistics gathered successfully:', {
        totalTokens: stats.totalTokens,
        totalTrades: stats.totalTrades,
        volume24h: stats.volume24h.toFixed(2),
        redisHealthy: stats.redis?.healthy
      });
      
      return stats;
      
    } catch (error) {
      console.error('[StatsService] Error gathering service statistics:', error);
      throw new Error('Failed to gather service statistics');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get database statistics
   */
  private async getDatabaseStats(): Promise<{
    totalTokens: number;
    tokensCreated24h: number;
    totalTrades: number;
    tradesProcessed24h: number;
    totalVolumeUsd: number;
    volume24h: number;
  }> {
    const prisma = (this.repository as any).prisma;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Query total tokens count
    const totalTokens = await prisma.monadLaunchedToken.count();
    
    // Query tokens created in last 24h
    const tokensCreated24h = await prisma.monadLaunchedToken.count({
      where: {
        timestamp: { gte: yesterday }
      }
    });
    
    // Query total trades count (only finalized/verified)
    const totalTrades = await prisma.monadTokenTrade.count({
      where: {
        commitState: { in: ['finalized', 'verified'] }
      }
    });
    
    // Query trades processed in last 24h
    const tradesProcessed24h = await prisma.monadTokenTrade.count({
      where: {
        timestamp: { gte: yesterday },
        commitState: { in: ['finalized', 'verified'] }
      }
    });
    
    // Aggregate total volume USD (all-time)
    const totalVolumeResult = await prisma.monadTokenTrade.aggregate({
      _sum: { usdAmount: true },
      where: {
        commitState: { in: ['finalized', 'verified'] }
      }
    });
    
    // Aggregate volume USD in last 24h
    const volume24hResult = await prisma.monadTokenTrade.aggregate({
      _sum: { usdAmount: true },
      where: {
        timestamp: { gte: yesterday },
        commitState: { in: ['finalized', 'verified'] }
      }
    });
    
    const totalVolumeUsd = Number(totalVolumeResult._sum.usdAmount || 0);
    const volume24h = Number(volume24hResult._sum.usdAmount || 0);
    
    console.log('[StatsService] Database stats:', {
      totalTokens,
      tokensCreated24h,
      totalTrades,
      tradesProcessed24h,
      totalVolumeUsd: totalVolumeUsd.toFixed(2),
      volume24h: volume24h.toFixed(2)
    });
    
    return {
      totalTokens,
      tokensCreated24h,
      totalTrades,
      tradesProcessed24h,
      totalVolumeUsd,
      volume24h
    };
  }

  /**
   * Get Redis cache statistics
   */
  private async getRedisStats(): Promise<{
    healthy: boolean;
    latency: number;
    cachedTokens: number;
    cachedTrades: number;
    cacheHitRate?: number;
  } | null> {
    try {
      // Check if Redis is enabled
      const redisEnabled = process.env['ENABLE_REDIS_CACHE'] === 'true';
      if (!redisEnabled) {
        console.log('[StatsService] Redis cache is disabled');
        return null;
      }
      
      // Perform health check
      const healthCheck = await this.cache.healthCheck();
      
      if (!healthCheck.healthy) {
        console.warn('[StatsService] Redis health check failed');
        return {
          healthy: false,
          latency: -1,
          cachedTokens: 0,
          cachedTrades: 0
        };
      }
      
      // Get cached tokens count (from sorted set)
      const redis = (this.cache as any).redis;
      const cachedTokens = await redis.zcard('monad:tracker:tokens:list');
      
      // Get cached trades count (from sorted set)
      const cachedTrades = await redis.zcard('monad:tracker:trades:recent');
      
      // Cache hit rate would be calculated from metrics (not implemented yet)
      // For now, return undefined
      const cacheHitRate = undefined;
      
      console.log('[StatsService] Redis stats:', {
        healthy: healthCheck.healthy,
        latency: healthCheck.latency,
        cachedTokens,
        cachedTrades
      });
      
      return {
        healthy: healthCheck.healthy,
        latency: healthCheck.latency,
        cachedTokens,
        cachedTrades,
        cacheHitRate
      };
      
    } catch (error) {
      console.error('[StatsService] Error getting Redis stats:', error);
      return {
        healthy: false,
        latency: -1,
        cachedTokens: 0,
        cachedTrades: 0
      };
    }
  }

  /**
   * Get tracker system statistics
   */
  private async getTrackerStats(): Promise<{
    uptime: number;
    isRunning: boolean;
    avgLatency: number;
    dataQuality: number;
  }> {
    try {
      // Get tracker status
      const status = this.tracker.getStatus();
      
      // Get system stats from tracker
      const systemStats = await this.tracker.getSystemStats();
      
      console.log('[StatsService] Tracker stats:', {
        uptime: status.uptime,
        isRunning: status.isRunning,
        avgLatency: systemStats.avgLatency,
        dataQuality: systemStats.dataQuality
      });
      
      return {
        uptime: status.uptime,
        isRunning: status.isRunning,
        avgLatency: systemStats.avgLatency,
        dataQuality: systemStats.dataQuality
      };
      
    } catch (error) {
      console.error('[StatsService] Error getting tracker stats:', error);
      return {
        uptime: process.uptime(),
        isRunning: false,
        avgLatency: 0,
        dataQuality: 0
      };
    }
  }
}
