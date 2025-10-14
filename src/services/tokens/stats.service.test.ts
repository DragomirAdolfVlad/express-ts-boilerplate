/**
 * StatsService Unit Tests
 * 
 * Tests for the StatsService implementation
 */

import { StatsService } from './stats.service';
import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';
import { RedisTrackerCache } from '../redis/tracker-cache.service';
import { MonadTrackerMain } from '../../infrastructure/blockchain/monad-tracker-main';

describe('StatsService', () => {
  let statsService: StatsService;
  let mockRepository: jest.Mocked<MonadTokenRepository>;
  let mockCache: jest.Mocked<RedisTrackerCache>;
  let mockTracker: jest.Mocked<MonadTrackerMain>;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      prisma: {
        monadLaunchedToken: {
          count: jest.fn(),
        },
        monadTokenTrade: {
          count: jest.fn(),
          aggregate: jest.fn(),
        },
      },
    } as any;

    // Create mock cache
    mockCache = {
      healthCheck: jest.fn(),
      redis: {
        zcard: jest.fn(),
      },
    } as any;

    // Create mock tracker
    mockTracker = {
      getStatus: jest.fn(),
      getSystemStats: jest.fn(),
    } as any;

    // Initialize service
    statsService = new StatsService(mockRepository, mockCache, mockTracker);
  });

  describe('getServiceStats', () => {
    it('should return complete statistics', async () => {
      // Mock database responses
      mockRepository.prisma.monadLaunchedToken.count
        .mockResolvedValueOnce(100) // totalTokens
        .mockResolvedValueOnce(10); // tokensCreated24h

      mockRepository.prisma.monadTokenTrade.count
        .mockResolvedValueOnce(500) // totalTrades
        .mockResolvedValueOnce(50); // tradesProcessed24h

      mockRepository.prisma.monadTokenTrade.aggregate
        .mockResolvedValueOnce({ _sum: { usdAmount: 10000 } }) // totalVolumeUsd
        .mockResolvedValueOnce({ _sum: { usdAmount: 1000 } }); // volume24h

      // Mock Redis responses
      process.env['ENABLE_REDIS_CACHE'] = 'true';
      mockCache.healthCheck.mockResolvedValue({ healthy: true, latency: 5 });
      (mockCache as any).redis.zcard
        .mockResolvedValueOnce(80) // cachedTokens
        .mockResolvedValueOnce(400); // cachedTrades

      // Mock tracker responses
      mockTracker.getStatus.mockReturnValue({
        isRunning: true,
        components: {
          tokenLaunchService: true,
          tradeProcessor: true,
          blockListener: true,
        },
        uptime: 3600,
      });

      mockTracker.getSystemStats.mockResolvedValue({
        totalTokens: 100,
        recentTokens: 10,
        totalTrades: 500,
        recentTrades: 50,
        totalVolumeUsd: 10000,
        volume24h: 1000,
        avgLatency: 450,
        dataQuality: 98.5,
      });

      // Execute
      const stats = await statsService.getServiceStats();

      // Verify
      expect(stats.totalTokens).toBe(100);
      expect(stats.tokensCreated24h).toBe(10);
      expect(stats.totalTrades).toBe(500);
      expect(stats.tradesProcessed24h).toBe(50);
      expect(stats.totalVolumeUsd).toBe(10000);
      expect(stats.volume24h).toBe(1000);
      expect(stats.avgProcessingLatency).toBe(450);
      expect(stats.redis?.healthy).toBe(true);
      expect(stats.redis?.latency).toBe(5);
      expect(stats.redis?.cachedTokens).toBe(80);
      expect(stats.redis?.cachedTrades).toBe(400);
      expect(stats.tracker?.uptime).toBe(3600);
      expect(stats.tracker?.isRunning).toBe(true);
      expect(stats.tracker?.dataQuality).toBe(98.5);
      expect(stats.serviceName).toBe('Monad Token API');
      expect(stats.timestamp).toBeInstanceOf(Date);
    });

    it('should handle Redis unavailable gracefully', async () => {
      // Mock database responses
      mockRepository.prisma.monadLaunchedToken.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10);

      mockRepository.prisma.monadTokenTrade.count
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(50);

      mockRepository.prisma.monadTokenTrade.aggregate
        .mockResolvedValueOnce({ _sum: { usdAmount: 10000 } })
        .mockResolvedValueOnce({ _sum: { usdAmount: 1000 } });

      // Mock Redis failure
      process.env['ENABLE_REDIS_CACHE'] = 'true';
      mockCache.healthCheck.mockResolvedValue({ healthy: false, latency: -1 });

      // Mock tracker responses
      mockTracker.getStatus.mockReturnValue({
        isRunning: true,
        components: {
          tokenLaunchService: true,
          tradeProcessor: true,
          blockListener: true,
        },
        uptime: 3600,
      });

      mockTracker.getSystemStats.mockResolvedValue({
        totalTokens: 100,
        recentTokens: 10,
        totalTrades: 500,
        recentTrades: 50,
        totalVolumeUsd: 10000,
        volume24h: 1000,
        avgLatency: 450,
        dataQuality: 98.5,
      });

      // Execute
      const stats = await statsService.getServiceStats();

      // Verify - other stats still work
      expect(stats.totalTokens).toBe(100);
      expect(stats.totalTrades).toBe(500);
      expect(stats.redis?.healthy).toBe(false);
      expect(stats.redis?.latency).toBe(-1);
    });

    it('should handle Redis disabled', async () => {
      // Mock database responses
      mockRepository.prisma.monadLaunchedToken.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10);

      mockRepository.prisma.monadTokenTrade.count
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(50);

      mockRepository.prisma.monadTokenTrade.aggregate
        .mockResolvedValueOnce({ _sum: { usdAmount: 10000 } })
        .mockResolvedValueOnce({ _sum: { usdAmount: 1000 } });

      // Disable Redis
      process.env['ENABLE_REDIS_CACHE'] = 'false';

      // Mock tracker responses
      mockTracker.getStatus.mockReturnValue({
        isRunning: true,
        components: {
          tokenLaunchService: true,
          tradeProcessor: true,
          blockListener: true,
        },
        uptime: 3600,
      });

      mockTracker.getSystemStats.mockResolvedValue({
        totalTokens: 100,
        recentTokens: 10,
        totalTrades: 500,
        recentTrades: 50,
        totalVolumeUsd: 10000,
        volume24h: 1000,
        avgLatency: 450,
        dataQuality: 98.5,
      });

      // Execute
      const stats = await statsService.getServiceStats();

      // Verify - Redis stats should be undefined
      expect(stats.totalTokens).toBe(100);
      expect(stats.totalTrades).toBe(500);
      expect(stats.redis).toBeUndefined();
    });

    it('should handle tracker errors gracefully', async () => {
      // Mock database responses
      mockRepository.prisma.monadLaunchedToken.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10);

      mockRepository.prisma.monadTokenTrade.count
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(50);

      mockRepository.prisma.monadTokenTrade.aggregate
        .mockResolvedValueOnce({ _sum: { usdAmount: 10000 } })
        .mockResolvedValueOnce({ _sum: { usdAmount: 1000 } });

      // Disable Redis
      process.env['ENABLE_REDIS_CACHE'] = 'false';

      // Mock tracker error
      mockTracker.getStatus.mockImplementation(() => {
        throw new Error('Tracker error');
      });

      // Execute
      const stats = await statsService.getServiceStats();

      // Verify - should use fallback values
      expect(stats.totalTokens).toBe(100);
      expect(stats.totalTrades).toBe(500);
      expect(stats.tracker?.isRunning).toBe(false);
      expect(stats.tracker?.uptime).toBeGreaterThan(0); // Uses process.uptime()
    });

    it('should throw error on database failure', async () => {
      // Mock database error
      mockRepository.prisma.monadLaunchedToken.count.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Execute and verify error
      await expect(statsService.getServiceStats()).rejects.toThrow(
        'Failed to gather service statistics'
      );
    });
  });
});
