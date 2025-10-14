/**
 * TokensService - Core token query operations
 * 
 * Handles all token-related business logic including:
 * - Latest tokens listing with pagination
 * - Pre-bond tokens filtering
 * - Token existence checks
 * - Token overview with trades
 * - Trading data and bonding curve information
 */

import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';
import { RedisTrackerCache } from '../redis/tracker-cache.service';
import { 
  TokenWithStats, 
  TokenWithMetadata, 
  TokenStats, 
  TradeTransaction,
  TradingData,
  BondingCurveReserves 
} from '../../types/tokens';

export class TokensService {
  constructor(
    // @ts-ignore - Used in methods below
    private readonly repository: MonadTokenRepository,
    // @ts-ignore - Used in methods below
    private readonly cache: RedisTrackerCache
  ) {
    console.log('[TokensService] Initialized with repository and cache');
  }

  /**
   * Get latest tokens with pagination
   * Requirements: 1
   */
  async getLatestTokens(limit: number = 50, offset: number = 0): Promise<{
    tokens: TokenWithStats[];
    total: number;
    hasNext: boolean;
  }> {
    try {
      console.log(`[TokensService] Getting latest tokens (limit: ${limit}, offset: ${offset})`);
      
      // Try Redis cache first
      try {
        const cachedTokens = await this.cache.getRecentTokens(limit + offset + 1);
        if (cachedTokens.length > 0) {
          console.log(`[TokensService] Cache hit: ${cachedTokens.length} tokens from Redis`);
          
          // Apply pagination to cached results
          const paginatedTokens = cachedTokens.slice(offset, offset + limit);
          const hasNext = cachedTokens.length > offset + limit;
          
          // Transform cached tokens to TokenWithStats format
          const tokens = await this.transformCachedTokensToStats(paginatedTokens);
          
          return {
            tokens,
            total: cachedTokens.length,
            hasNext
          };
        }
      } catch (cacheError) {
        console.warn('[TokensService] Cache miss, falling back to database:', cacheError);
      }
      
      // Fallback to database query
      const prisma = (this.repository as any).prisma;
      
      // Get total count
      const total = await prisma.monadLaunchedToken.count();
      
      // Query tokens with pagination, ordered by timestamp DESC
      const dbTokens = await prisma.monadLaunchedToken.findMany({
        take: limit,
        skip: offset,
        orderBy: { timestamp: 'desc' },
        include: {
          metadata: true,
          tokenStats: true
        }
      });
      
      // Transform to TokenWithStats format
      const tokens = this.transformDbTokensToStats(dbTokens);
      
      // Calculate hasNext flag
      const hasNext = offset + limit < total;
      
      console.log(`[TokensService] Fetched ${tokens.length} tokens from database (total: ${total})`);
      
      return {
        tokens,
        total,
        hasNext
      };
    } catch (error) {
      console.error('[TokensService] Error getting latest tokens:', error);
      throw new Error('Failed to fetch latest tokens');
    }
  }

  /**
   * Get pre-bond tokens (curveProgress >= 65%)
   * Requirements: 2
   */
  async getPreBondTokens(limit: number = 50, offset: number = 0): Promise<{
    tokens: TokenWithStats[];
    total: number;
    hasNext: boolean;
  }> {
    try {
      console.log(`[TokensService] Getting pre-bond tokens (limit: ${limit}, offset: ${offset})`);
      
      const prisma = (this.repository as any).prisma;
      
      // Query tokens with curveProgress >= 65% from latest trade
      // We need to get the latest trade for each token to check curve progress
      const preBondTokens = await prisma.monadLaunchedToken.findMany({
        include: {
          metadata: true,
          tokenStats: true,
          trades: {
            take: 1,
            orderBy: { timestamp: 'desc' },
            where: {
              commitState: { in: ['finalized', 'verified'] }
            }
          }
        }
      });
      
      // Filter tokens with curveProgress >= 65%
      const filteredTokens = preBondTokens
        .filter((token: any) => {
          const latestTrade = token.trades[0];
          if (!latestTrade) return false;
          
          const curveProgress = latestTrade.curveProgress || 0;
          return curveProgress >= 65;
        })
        .sort((a: any, b: any) => {
          // Sort by curveProgress descending (closest to completion first)
          const progressA = a.trades[0]?.curveProgress || 0;
          const progressB = b.trades[0]?.curveProgress || 0;
          return progressB - progressA;
        });
      
      // Get total count
      const total = filteredTokens.length;
      
      // Apply pagination
      const paginatedTokens = filteredTokens.slice(offset, offset + limit);
      
      // Transform to TokenWithStats format
      const tokens = paginatedTokens.map((token: any) => {
        const latestTrade = token.trades[0];
        
        return {
          address: token.token,
          name: token.name || token.metadata?.name || 'Unknown',
          symbol: token.symbol || token.metadata?.symbol || 'UNKNOWN',
          creator: token.creator,
          bondingCurve: token.bondingCurve,
          timestamp: token.timestamp,
          metadata: token.metadata ? {
            description: token.metadata.description || undefined,
            image: token.metadata.image || undefined,
            website: token.metadata.website ? JSON.stringify(token.metadata.website) : undefined,
            twitter: token.metadata.twitter || undefined,
            telegram: token.metadata.telegram || undefined
          } : undefined,
          stats: {
            ...this.buildTokenStats(token.tokenStats),
            curveProgress: latestTrade?.curveProgress || 0,
            marketCap: Number(latestTrade?.marketCap || 0),
            liquidityUsd: Number(latestTrade?.liquidityUsd || 0)
          }
        };
      });
      
      // Calculate hasNext flag
      const hasNext = offset + limit < total;
      
      console.log(`[TokensService] Found ${tokens.length} pre-bond tokens (total: ${total})`);
      
      return {
        tokens,
        total,
        hasNext
      };
    } catch (error) {
      console.error('[TokensService] Error getting pre-bond tokens:', error);
      throw new Error('Failed to fetch pre-bond tokens');
    }
  }

  /**
   * Check if token exists
   * Requirements: 3
   */
  async tokenExists(tokenAddress: string): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      console.log(`[TokensService] Checking if token exists: ${tokenAddress}`);
      
      // Try cache first
      try {
        const cachedToken = await this.cache.getToken(tokenAddress);
        if (cachedToken) {
          console.log(`[TokensService] Token found in cache: ${tokenAddress}`);
          return true;
        }
      } catch (cacheError) {
        console.warn('[TokensService] Cache error, checking database:', cacheError);
      }
      
      // Check database
      const token = await this.repository.findTokenByAddress(tokenAddress);
      const exists = token !== null;
      
      console.log(`[TokensService] Token ${tokenAddress} exists: ${exists}`);
      return exists;
    } catch (error) {
      console.error('[TokensService] Error checking token existence:', error);
      throw new Error('Failed to check token existence');
    }
  }

  /**
   * Get token overview with recent trades
   * Requirements: 4
   * Task 8.3: Integrated caching with fallback
   */
  async getTokenOverview(tokenAddress: string): Promise<{ // eslint-disable-line @typescript-eslint/no-unused-vars
    token: TokenWithMetadata;
    stats: TokenStats;
    transactions: TradeTransaction[];
  }> {
    try {
      console.log(`[TokensService] Getting token overview: ${tokenAddress}`);
      
      // Try cache first for token with stats
      try {
        const cachedToken = await this.cache.getTokenWithStats(tokenAddress);
        if (cachedToken) {
          console.log(`[TokensService] Cache hit for token overview: ${tokenAddress}`);
          
          // Still need to fetch trades from database (not cached)
          const prisma = (this.repository as any).prisma;
          const dbTrades = await prisma.monadTokenTrade.findMany({
            where: { 
              tokenAddress,
              commitState: { in: ['finalized', 'verified'] }
            },
            take: 100,
            orderBy: { timestamp: 'desc' }
          });
          
          const transactions: TradeTransaction[] = dbTrades.map((trade: any) => ({
            signature: trade.signature || '',
            trader: trade.trader,
            isBuy: trade.isBuy,
            wmonAmount: Number(trade.wmonAmount),
            tokenAmount: Number(trade.tokenAmount),
            pricePerToken: Number(trade.pricePerToken),
            usdAmount: Number(trade.usdAmount),
            timestamp: trade.timestamp,
            blockNumber: parseInt(trade.blockNumber),
            commitState: trade.commitState
          }));
          
          return {
            token: cachedToken,
            stats: cachedToken.stats,
            transactions
          };
        }
      } catch (cacheError) {
        console.warn('[TokensService] Cache error, falling back to database:', cacheError);
      }
      
      // Fallback to database
      const prisma = (this.repository as any).prisma;
      
      // Fetch token with metadata and stats
      const dbToken = await prisma.monadLaunchedToken.findUnique({
        where: { token: tokenAddress },
        include: {
          metadata: true,
          tokenStats: true
        }
      });
      
      if (!dbToken) {
        throw new Error('Token not found');
      }
      
      // Fetch recent 100 trades ordered by timestamp DESC
      const dbTrades = await prisma.monadTokenTrade.findMany({
        where: { 
          tokenAddress,
          commitState: { in: ['finalized', 'verified'] }
        },
        take: 100,
        orderBy: { timestamp: 'desc' }
      });
      
      // Transform token to TokenWithMetadata
      const token: TokenWithMetadata = {
        address: dbToken.token,
        name: dbToken.name || dbToken.metadata?.name || 'Unknown',
        symbol: dbToken.symbol || dbToken.metadata?.symbol || 'UNKNOWN',
        creator: dbToken.creator,
        bondingCurve: dbToken.bondingCurve,
        timestamp: dbToken.timestamp,
        metadata: dbToken.metadata ? {
          description: dbToken.metadata.description || undefined,
          image: dbToken.metadata.image || undefined,
          website: dbToken.metadata.website ? JSON.stringify(dbToken.metadata.website) : undefined,
          twitter: dbToken.metadata.twitter || undefined,
          telegram: dbToken.metadata.telegram || undefined
        } : undefined,
        stats: this.buildTokenStats(dbToken.tokenStats)
      };
      
      // Get latest trade for market data
      const latestTrade = dbTrades[0];
      if (latestTrade) {
        token.stats.curveProgress = latestTrade.curveProgress || 0;
        token.stats.marketCap = Number(latestTrade.marketCap || 0);
        token.stats.liquidityUsd = Number(latestTrade.liquidityUsd || 0);
      }
      
      // Cache the token with stats for future requests
      try {
        await this.cache.cacheTokenWithStats(token);
      } catch (cacheError) {
        console.warn('[TokensService] Failed to cache token with stats:', cacheError);
      }
      
      // Transform trades to TradeTransaction format
      const transactions: TradeTransaction[] = dbTrades.map((trade: any) => ({
        signature: trade.signature || '',
        trader: trade.trader,
        isBuy: trade.isBuy,
        wmonAmount: Number(trade.wmonAmount),
        tokenAmount: Number(trade.tokenAmount),
        pricePerToken: Number(trade.pricePerToken),
        usdAmount: Number(trade.usdAmount),
        timestamp: trade.timestamp,
        blockNumber: parseInt(trade.blockNumber),
        commitState: trade.commitState
      }));
      
      console.log(`[TokensService] Token overview fetched: ${token.symbol} with ${transactions.length} trades`);
      
      return {
        token,
        stats: token.stats,
        transactions
      };
    } catch (error) {
      console.error('[TokensService] Error getting token overview:', error);
      throw error;
    }
  }

  /**
   * Get trading data and bonding curve information
   * Requirements: 7
   */
  async getTradingData(tokenAddress: string): Promise<TradingData> { // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      console.log(`[TokensService] Getting trading data: ${tokenAddress}`);
      
      const prisma = (this.repository as any).prisma;
      
      // Fetch token
      const dbToken = await prisma.monadLaunchedToken.findUnique({
        where: { token: tokenAddress }
      });
      
      if (!dbToken) {
        throw new Error('Token not found');
      }
      
      // Fetch latest finalized/verified trade to get current reserves and price
      const latestTrade = await prisma.monadTokenTrade.findFirst({
        where: {
          tokenAddress,
          commitState: { in: ['finalized', 'verified'] }
        },
        orderBy: { timestamp: 'desc' }
      });
      
      // Build bonding curve reserves
      const reserves: BondingCurveReserves = {
        virtualWmonReserve: latestTrade ? Number(latestTrade.virtualWmonReserve) : 30000,
        virtualTokenReserve: latestTrade ? Number(latestTrade.virtualTokenReserve) : 1000000000,
        realWmonReserve: undefined, // Not stored in current schema
        realTokenReserve: undefined  // Not stored in current schema
      };
      
      // Calculate current price from latest trade
      const currentPrice = latestTrade ? Number(latestTrade.pricePerToken) : 0;
      
      // Get curve progress, market cap, and liquidity from latest trade
      const curveProgress = latestTrade?.curveProgress || 0;
      const marketCap = latestTrade ? Number(latestTrade.marketCap) : 0;
      const liquidityUsd = latestTrade ? Number(latestTrade.liquidityUsd) : 0;
      
      const tradingData: TradingData = {
        bondingCurve: dbToken.bondingCurve,
        reserves,
        curveProgress,
        currentPrice,
        marketCap,
        liquidityUsd
      };
      
      console.log(`[TokensService] Trading data fetched for ${tokenAddress}: price=${currentPrice}, progress=${curveProgress}%`);
      
      return tradingData;
    } catch (error) {
      console.error('[TokensService] Error getting trading data:', error);
      throw error;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Transform cached tokens from Redis to TokenWithStats format
   */
  private async transformCachedTokensToStats(cachedTokens: any[]): Promise<TokenWithStats[]> {
    const prisma = (this.repository as any).prisma;
    
    // Get stats for all tokens in parallel
    const tokenAddresses = cachedTokens.map(t => t.tokenAddress);
    const statsRecords = await prisma.monadTokenTradeStats.findMany({
      where: {
        tokenAddress: { in: tokenAddresses }
      }
    });
    
    // Create a map for quick lookup
    const statsMap = new Map(statsRecords.map((s: any) => [s.tokenAddress, s]));
    
    return cachedTokens.map(token => {
      const stats = statsMap.get(token.tokenAddress);
      
      return {
        address: token.tokenAddress,
        name: token.name || 'Unknown',
        symbol: token.symbol || 'UNKNOWN',
        creator: token.creator,
        bondingCurve: token.bondingCurve,
        timestamp: new Date(token.timestamp),
        metadata: token.metadata ? {
          description: token.metadata.description,
          image: token.metadata.image,
          website: token.metadata.website,
          twitter: token.metadata.twitter,
          telegram: token.metadata.telegram
        } : undefined,
        stats: this.buildTokenStats(stats)
      };
    });
  }

  /**
   * Transform database tokens to TokenWithStats format
   */
  private transformDbTokensToStats(dbTokens: any[]): TokenWithStats[] {
    return dbTokens.map(token => ({
      address: token.token,
      name: token.name || token.metadata?.name || 'Unknown',
      symbol: token.symbol || token.metadata?.symbol || 'UNKNOWN',
      creator: token.creator,
      bondingCurve: token.bondingCurve,
      timestamp: token.timestamp,
      metadata: token.metadata ? {
        description: token.metadata.description || undefined,
        image: token.metadata.image || undefined,
        website: token.metadata.website ? JSON.stringify(token.metadata.website) : undefined,
        twitter: token.metadata.twitter || undefined,
        telegram: token.metadata.telegram || undefined
      } : undefined,
      stats: this.buildTokenStats(token.tokenStats)
    }));
  }

  /**
   * Build TokenStats object from database stats record
   */
  private buildTokenStats(statsRecord: any): TokenStats {
    if (!statsRecord) {
      // Return default stats if no record exists
      return {
        totalVolume: 0,
        totalTrades: 0,
        buyCount: 0,
        sellCount: 0,
        marketCap: 0,
        liquidityUsd: 0,
        curveProgress: 0,
        lastTradeTime: new Date(),
        proposedTrades: 0,
        finalizedTrades: 0,
        verifiedTrades: 0
      };
    }

    return {
      totalVolume: Number(statsRecord.totalUsdVolume || 0),
      totalTrades: statsRecord.totalTxCount || 0,
      buyCount: statsRecord.buyCount || 0,
      sellCount: statsRecord.sellCount || 0,
      marketCap: 0, // Will be calculated from latest trade
      liquidityUsd: 0, // Will be calculated from latest trade
      curveProgress: 0, // Will be calculated from latest trade
      lastTradeTime: statsRecord.lastTradeTime || new Date(),
      proposedTrades: statsRecord.proposedTrades || 0,
      finalizedTrades: statsRecord.finalizedTrades || 0,
      verifiedTrades: statsRecord.verifiedTrades || 0
    };
  }
}
