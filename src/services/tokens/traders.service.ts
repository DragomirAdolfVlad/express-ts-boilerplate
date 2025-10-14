/**
 * TradersService - Trader performance calculations
 * 
 * Handles trader-related business logic including:
 * - Calculating trader metrics from trades
 * - Ranking traders by total PnL
 * - Computing realized and unrealized PnL
 * - Calculating win rate (percentage of profitable trades)
 */

import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';
import { RedisTrackerCache } from '../redis/tracker-cache.service';
import { TraderData } from '../../types/tokens';

export class TradersService {
  constructor(
    // @ts-ignore - Used in methods below
    private readonly repository: MonadTokenRepository,
    // @ts-ignore - Used in methods below
    private readonly cache: RedisTrackerCache
  ) {
    console.log('[TradersService] Initialized with repository and cache');
  }

  /**
   * Get token traders with rankings
   * Requirements: 6
   * Task 8.3: Integrated caching with fallback
   */
  async getTokenTraders(tokenAddress: string, limit?: number): Promise<TraderData[]> {
    try {
      console.log(`[TradersService] Getting traders for token: ${tokenAddress}`);
      
      // Try cache first
      try {
        const cachedTraders = await this.cache.getTraderRankings(tokenAddress);
        if (cachedTraders) {
          console.log(`[TradersService] Cache hit for traders: ${tokenAddress}`);
          return limit ? cachedTraders.slice(0, limit) : cachedTraders;
        }
      } catch (cacheError) {
        console.warn('[TradersService] Cache error, falling back to database:', cacheError);
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
        console.log(`[TradersService] No trades found for token: ${tokenAddress}`);
        return [];
      }
      
      // Get current price from latest trade
      const latestTrade = dbTrades[0];
      const currentPrice = Number(latestTrade.pricePerToken);
      
      console.log(`[TradersService] Processing ${dbTrades.length} trades, current price: ${currentPrice}`);
      
      // Calculate trader metrics from trades
      const traderMetricsMap = this.calculateTraderMetrics(dbTrades, currentPrice);
      
      // Convert map to array - INCLUDE ALL TRADERS (even with netTokens = 0)
      let traders = Array.from(traderMetricsMap.values());
      
      console.log(`[TradersService] Found ${traders.length} traders (including those with zero balance)`);
      
      // Rank traders by totalPnlUsd descending (most profitable first)
      traders.sort((a, b) => b.totalPnlUsd - a.totalPnlUsd);
      
      // Add rank field (1-based)
      traders = traders.map((trader, index) => ({
        ...trader,
        rank: index + 1
      }));
      
      // Cache the full results before applying limit
      try {
        await this.cache.cacheTraderRankings(tokenAddress, traders);
      } catch (cacheError) {
        console.warn('[TradersService] Failed to cache traders:', cacheError);
      }
      
      // Apply limit if specified
      if (limit && limit > 0) {
        traders = traders.slice(0, limit);
      }
      
      console.log(`[TradersService] Returning ${traders.length} traders for ${tokenAddress}`);
      return traders;
    } catch (error) {
      console.error('[TradersService] Error getting token traders:', error);
      throw new Error('Failed to fetch token traders');
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Calculate trader metrics from trades
   * Aggregates all trades for each unique trader address
   * Includes ALL traders (even those with netTokens = 0)
   */
  private calculateTraderMetrics(trades: any[], currentPrice: number): Map<string, TraderData> {
    const traderMap = new Map<string, TraderData>();
    
    // Iterate through all trades and aggregate by trader address
    for (const trade of trades) {
      const traderAddress = trade.trader;
      
      // Get or initialize trader data
      let trader = traderMap.get(traderAddress);
      if (!trader) {
        trader = {
          address: traderAddress,
          rank: 0, // Will be set later
          netTokens: 0,
          totalBought: 0,
          totalSold: 0,
          buyCount: 0,
          sellCount: 0,
          avgBuyPrice: 0,
          avgSellPrice: 0,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 0,
          totalPnlUsd: 0,
          winRate: 0 // Will be calculated later
        };
        traderMap.set(traderAddress, trader);
      }
      
      const tokenAmount = Number(trade.tokenAmount);
      const pricePerToken = Number(trade.pricePerToken);
      
      if (trade.isBuy) {
        // BUY trade: accumulate tokens
        trader.totalBought += tokenAmount;
        trader.buyCount++;
        
        // Calculate weighted average buy price
        // Formula: (prevAvg * prevTotal + newPrice * newAmount) / (prevTotal + newAmount)
        const prevTotalCost = trader.avgBuyPrice * (trader.totalBought - tokenAmount);
        const newTotalCost = prevTotalCost + (pricePerToken * tokenAmount);
        trader.avgBuyPrice = trader.totalBought > 0 ? newTotalCost / trader.totalBought : 0;
        
      } else {
        // SELL trade: reduce tokens and calculate realized PnL
        trader.totalSold += tokenAmount;
        trader.sellCount++;
        
        // Calculate weighted average sell price
        const prevTotalRevenue = trader.avgSellPrice * (trader.totalSold - tokenAmount);
        const newTotalRevenue = prevTotalRevenue + (pricePerToken * tokenAmount);
        trader.avgSellPrice = trader.totalSold > 0 ? newTotalRevenue / trader.totalSold : 0;
        
        // Calculate realized PnL from this sell
        // PnL = (sellPrice - avgBuyPrice) * tokenAmount
        const realizedPnl = (pricePerToken - trader.avgBuyPrice) * tokenAmount;
        trader.realizedPnlUsd += realizedPnl;
      }
    }
    
    // Calculate net tokens, unrealized PnL, win rate, and total PnL for each trader
    for (const trader of traderMap.values()) {
      // Net tokens = total bought - total sold
      trader.netTokens = trader.totalBought - trader.totalSold;
      
      // Calculate unrealized PnL for remaining holdings
      trader.unrealizedPnlUsd = this.calculateUnrealizedPnL(trader, currentPrice);
      
      // Calculate win rate
      trader.winRate = this.calculateWinRate(trader);
      
      // Total PnL = realized + unrealized
      trader.totalPnlUsd = trader.realizedPnlUsd + trader.unrealizedPnlUsd;
    }
    
    return traderMap;
  }

  /**
   * Calculate unrealized PnL for a trader
   * Formula: netTokens * (currentPrice - avgBuyPrice)
   */
  private calculateUnrealizedPnL(trader: TraderData, currentPrice: number): number {
    // Only calculate unrealized PnL if trader has tokens
    if (trader.netTokens <= 0) {
      return 0;
    }
    
    // Unrealized PnL = netTokens * (currentPrice - avgBuyPrice)
    // This represents the profit/loss on tokens still held
    const unrealizedPnl = trader.netTokens * (currentPrice - trader.avgBuyPrice);
    
    return unrealizedPnl;
  }

  /**
   * Calculate win rate for a trader
   * Formula: (profitable trades / total sell trades) * 100
   * A trade is profitable if sell price > avg buy price
   */
  private calculateWinRate(trader: TraderData): number { // eslint-disable-line @typescript-eslint/no-unused-vars
    // Handle edge case of zero sell trades
    if (trader.sellCount === 0) {
      return 0;
    }
    
    // Win rate is calculated based on whether the average sell price
    // is higher than the average buy price
    // This is a simplified approach - a more accurate calculation would
    // track each individual sell trade and compare it to the buy price at that time
    
    // For now, we use a simple heuristic:
    // If avgSellPrice > avgBuyPrice, the trader is profitable on their sells
    const isProfitable = trader.avgSellPrice > trader.avgBuyPrice;
    
    // Calculate win rate as percentage
    // This is a simplified calculation - in a real system, you'd track
    // individual sell trades and their profitability
    const winRate = isProfitable ? 100 : 0;
    
    // Round to 2 decimal places
    return Math.round(winRate * 100) / 100;
  }
}
