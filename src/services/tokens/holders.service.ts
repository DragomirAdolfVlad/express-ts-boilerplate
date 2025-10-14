/**
 * HoldersService - Holder ranking calculations
 * 
 * Handles holder-related business logic including:
 * - Calculating holder metrics from trades
 * - Ranking holders by net token holdings
 * - Computing realized and unrealized PnL
 * - Calculating percentage of supply held
 */

import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';
import { RedisTrackerCache } from '../redis/tracker-cache.service';
import { HolderData } from '../../types/tokens';

export class HoldersService {
  constructor(
    private readonly repository: MonadTokenRepository,
    private readonly cache: RedisTrackerCache
  ) {
    console.log('[HoldersService] Initialized with repository and cache');
  }

  /**
   * Get token holders with rankings
   * Requirements: 5
   * Task 8.3: Integrated caching with fallback
   */
  async getTokenHolders(tokenAddress: string, limit?: number): Promise<HolderData[]> {
    try {
      console.log(`[HoldersService] Getting holders for token: ${tokenAddress}`);
      
      // Try cache first
      try {
        const cachedHolders = await this.cache.getHolderRankings(tokenAddress);
        if (cachedHolders) {
          console.log(`[HoldersService] Cache hit for holders: ${tokenAddress}`);
          return limit ? cachedHolders.slice(0, limit) : cachedHolders;
        }
      } catch (cacheError) {
        console.warn('[HoldersService] Cache error, falling back to database:', cacheError);
      }
      
      // Fetch all trades for token from database
      const prisma = (this.repository as any).prisma;
      const dbTrades = await prisma.monadTokenTrade.findMany({
        where: {
          tokenAddress,
          commitState: { in: ['finalized', 'verified'] } // Only count confirmed trades
        },
        orderBy: { timestamp: 'desc' }
      });
      
      if (dbTrades.length === 0) {
        console.log(`[HoldersService] No trades found for token: ${tokenAddress}`);
        return [];
      }
      
      // Get current price from latest trade
      const latestTrade = dbTrades[0];
      const currentPrice = Number(latestTrade.pricePerToken);
      
      console.log(`[HoldersService] Processing ${dbTrades.length} trades, current price: ${currentPrice}`);
      
      // Calculate holder metrics from trades
      const holderMetricsMap = this.calculateHolderMetrics(dbTrades, currentPrice);
      
      // Convert map to array and filter out holders with zero balance
      let holders = Array.from(holderMetricsMap.values())
        .filter(holder => holder.netTokens > 0);
      
      console.log(`[HoldersService] Found ${holders.length} holders with non-zero balance`);
      
      // Rank holders by netTokens descending (largest holders first)
      holders.sort((a, b) => b.netTokens - a.netTokens);
      
      // Add rank field (1-based)
      holders = holders.map((holder, index) => ({
        ...holder,
        rank: index + 1
      }));
      
      // Cache the full results before applying limit
      try {
        await this.cache.cacheHolderRankings(tokenAddress, holders);
      } catch (cacheError) {
        console.warn('[HoldersService] Failed to cache holders:', cacheError);
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        holders = holders.slice(0, limit);
      }
      
      console.log(`[HoldersService] Returning ${holders.length} holders for ${tokenAddress}`);
      return holders;
    } catch (error) {
      console.error('[HoldersService] Error getting token holders:', error);
      throw new Error('Failed to fetch token holders');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate holder metrics from trades
   * Aggregates all trades for each unique trader address
   */
  private calculateHolderMetrics(trades: any[], currentPrice: number): Map<string, HolderData> {
    const holderMap = new Map<string, HolderData>();
    
    // Iterate through all trades and aggregate by trader address
    for (const trade of trades) {
      const traderAddress = trade.trader;
      
      // Get or initialize holder data
      let holder = holderMap.get(traderAddress);
      if (!holder) {
        holder = {
          address: traderAddress,
          rank: 0, // Will be set later
          netTokens: 0,
          percentageOfSupply: 0, // Will be calculated later
          totalBought: 0,
          totalSold: 0,
          buyCount: 0,
          sellCount: 0,
          avgBuyPrice: 0,
          avgSellPrice: 0,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 0,
          totalPnlUsd: 0
        };
        holderMap.set(traderAddress, holder);
      }
      
      const tokenAmount = Number(trade.tokenAmount);
      const pricePerToken = Number(trade.pricePerToken);
      
      if (trade.isBuy) {
        // BUY trade: accumulate tokens
        holder.totalBought += tokenAmount;
        holder.buyCount++;
        
        // Calculate weighted average buy price
        // Formula: (prevAvg * prevTotal + newPrice * newAmount) / (prevTotal + newAmount)
        const prevTotalCost = holder.avgBuyPrice * (holder.totalBought - tokenAmount);
        const newTotalCost = prevTotalCost + (pricePerToken * tokenAmount);
        holder.avgBuyPrice = holder.totalBought > 0 ? newTotalCost / holder.totalBought : 0;
        
      } else {
        // SELL trade: reduce tokens and calculate realized PnL
        holder.totalSold += tokenAmount;
        holder.sellCount++;
        
        // Calculate weighted average sell price
        const prevTotalRevenue = holder.avgSellPrice * (holder.totalSold - tokenAmount);
        const newTotalRevenue = prevTotalRevenue + (pricePerToken * tokenAmount);
        holder.avgSellPrice = holder.totalSold > 0 ? newTotalRevenue / holder.totalSold : 0;
        
        // Calculate realized PnL from this sell
        // PnL = (sellPrice - avgBuyPrice) * tokenAmount
        const realizedPnl = (pricePerToken - holder.avgBuyPrice) * tokenAmount;
        holder.realizedPnlUsd += realizedPnl;
      }
    }
    
    // Calculate net tokens, unrealized PnL, and percentage of supply for each holder
    for (const holder of holderMap.values()) {
      // Net tokens = total bought - total sold
      holder.netTokens = holder.totalBought - holder.totalSold;
      
      // Calculate unrealized PnL for remaining holdings
      holder.unrealizedPnlUsd = this.calculateUnrealizedPnL(holder, currentPrice);
      
      // Total PnL = realized + unrealized
      holder.totalPnlUsd = holder.realizedPnlUsd + holder.unrealizedPnlUsd;
      
      // Calculate percentage of supply
      holder.percentageOfSupply = this.calculatePercentageOfSupply(holder.netTokens);
    }
    
    return holderMap;
  }

  /**
   * Calculate unrealized PnL for a holder
   * Formula: netTokens * (currentPrice - avgBuyPrice)
   */
  private calculateUnrealizedPnL(holder: HolderData, currentPrice: number): number {
    // Only calculate unrealized PnL if holder has tokens
    if (holder.netTokens <= 0) {
      return 0;
    }
    
    // Unrealized PnL = netTokens * (currentPrice - avgBuyPrice)
    // This represents the profit/loss on tokens still held
    const unrealizedPnl = holder.netTokens * (currentPrice - holder.avgBuyPrice);
    
    return unrealizedPnl;
  }

  /**
   * Calculate percentage of supply held
   * Formula: (netTokens / totalSupply) * 100
   */
  private calculatePercentageOfSupply(netTokens: number): number {
    // Total supply for Monad bonding curve is 1 billion tokens
    const TOTAL_SUPPLY = 1_000_000_000;
    
    if (netTokens <= 0 || TOTAL_SUPPLY <= 0) {
      return 0;
    }
    
    // Calculate percentage: (netTokens / totalSupply) * 100
    const percentage = (netTokens / TOTAL_SUPPLY) * 100;
    
    // Round to 4 decimal places for precision
    return Math.round(percentage * 10000) / 10000;
  }
}
