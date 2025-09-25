/**
 * Simple Monad Repository
 * 
 * Simplified database operations using raw SQL queries
 * to bypass Prisma client generation issues.
 */

import { PrismaClient } from '@prisma/client';
import { MonadToken, MonadTrade } from '../../domain/entities/monad-token.entity';

export class SimpleMonadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveToken(token: MonadToken): Promise<void> {
    try {
      // Use raw SQL to insert token
      await this.prisma.$executeRaw`
        INSERT INTO monad_launched_tokens (
          platform, signature, creator, token, bonding_curve, 
          block_number, block_id, commit_state, timestamp, 
          name, symbol, created_at, updated_at
        ) VALUES (
          'monad', ${token.blockId}, ${token.creator}, ${token.address}, 
          ${token.bondingCurve}, ${token.blockNumber}, ${token.blockId}, 
          ${token.commitState}, ${token.timestamp}, ${token.name || ''}, 
          ${token.symbol || ''}, NOW(), NOW()
        ) ON CONFLICT (token) DO UPDATE SET
          commit_state = EXCLUDED.commit_state,
          updated_at = NOW()
      `;

      console.log(`[💾 DB] Token saved via raw SQL: ${token.address}`);
    } catch (error) {
      console.error(`[❌ DB] Failed to save token ${token.address}:`, error);
      throw error;
    }
  }

  async saveTrade(trade: MonadTrade): Promise<void> {
    try {
      // Calculate USD amount
      const wmonAmountDecimal = Number(trade.wmonAmount) / 1e18;
      const tokenAmountDecimal = Number(trade.tokenAmount) / 1e18;
      const pricePerTokenDecimal = Number(trade.pricePerToken) / 1e18;
      
      // Use raw SQL to insert trade
      await this.prisma.$executeRaw`
        INSERT INTO monad_token_trades (
          token_address, signature, block_number, block_id, commit_state,
          trader, is_buy, wmon_amount, token_amount, price_per_token,
          usd_amount, timestamp, reserve1, reserve2, reserve3, reserve4,
          created_at, updated_at
        ) VALUES (
          ${trade.tokenAddress}, ${trade.transactionHash}, ${trade.blockNumber}, 
          ${trade.blockId}, ${trade.commitState}, ${trade.trader}, ${trade.isBuy},
          ${wmonAmountDecimal}, ${tokenAmountDecimal}, ${pricePerTokenDecimal},
          0, ${trade.timestamp}, ${trade.reserves.reserve1.toString()},
          ${trade.reserves.reserve2.toString()}, ${trade.reserves.reserve3.toString()},
          ${trade.reserves.reserve4.toString()}, NOW(), NOW()
        ) ON CONFLICT (signature) DO NOTHING
      `;

      console.log(`[💾 DB] Trade saved via raw SQL: ${trade.tokenAddress} ${trade.isBuy ? 'BUY' : 'SELL'}`);
      
      // Update statistics
      await this.updateTokenStats(trade.tokenAddress);
      
    } catch (error) {
      console.error(`[❌ DB] Failed to save trade:`, error);
      throw error;
    }
  }

  async updateTokenStats(tokenAddress: string): Promise<void> {
    try {
      // Update statistics using raw SQL
      await this.prisma.$executeRaw`
        INSERT INTO monad_token_trade_stats (
          token_address, total_tx_count, total_wmon_volume, total_usd_volume,
          buy_count, sell_count, buy_volume_usd, sell_volume_usd,
          last_trade_time, finalized_trades, created_at, updated_at
        )
        SELECT 
          token_address,
          COUNT(*) as total_tx_count,
          SUM(wmon_amount) as total_wmon_volume,
          SUM(usd_amount) as total_usd_volume,
          COUNT(*) FILTER (WHERE is_buy = true) as buy_count,
          COUNT(*) FILTER (WHERE is_buy = false) as sell_count,
          SUM(usd_amount) FILTER (WHERE is_buy = true) as buy_volume_usd,
          SUM(usd_amount) FILTER (WHERE is_buy = false) as sell_volume_usd,
          MAX(timestamp) as last_trade_time,
          COUNT(*) FILTER (WHERE commit_state IN ('finalized', 'verified')) as finalized_trades,
          NOW(),
          NOW()
        FROM monad_token_trades 
        WHERE token_address = ${tokenAddress}
        GROUP BY token_address
        ON CONFLICT (token_address) DO UPDATE SET
          total_tx_count = EXCLUDED.total_tx_count,
          total_wmon_volume = EXCLUDED.total_wmon_volume,
          total_usd_volume = EXCLUDED.total_usd_volume,
          buy_count = EXCLUDED.buy_count,
          sell_count = EXCLUDED.sell_count,
          buy_volume_usd = EXCLUDED.buy_volume_usd,
          sell_volume_usd = EXCLUDED.sell_volume_usd,
          last_trade_time = EXCLUDED.last_trade_time,
          finalized_trades = EXCLUDED.finalized_trades,
          updated_at = NOW()
      `;

      console.log(`[📊 DB] Stats updated for ${tokenAddress}`);
    } catch (error) {
      console.error(`[❌ DB] Failed to update stats for ${tokenAddress}:`, error);
    }
  }

  async getTradeCount(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM monad_token_trades
      ` as any[];
      
      return Number(result[0]?.count || 0);
    } catch (error) {
      console.error('[❌ DB] Failed to get trade count:', error);
      return 0;
    }
  }

  async getTokenCount(): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM monad_launched_tokens
      ` as any[];
      
      return Number(result[0]?.count || 0);
    } catch (error) {
      console.error('[❌ DB] Failed to get token count:', error);
      return 0;
    }
  }

  async getRecentTrades(limit: number = 10): Promise<any[]> {
    try {
      const trades = await this.prisma.$queryRaw`
        SELECT * FROM monad_token_trades 
        ORDER BY timestamp DESC 
        LIMIT ${limit}
      ` as any[];
      
      return trades;
    } catch (error) {
      console.error('[❌ DB] Failed to get recent trades:', error);
      return [];
    }
  }
}