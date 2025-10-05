/**
 * Batch Database Writer
 * 
 * Optimized batch operations for database writes to reduce
 * latency and improve throughput for high-frequency trading data
 */

import { PrismaClient } from '@prisma/client';
import { BLOCKCHAIN_CONFIG } from '../../config/blockchain.config';

export interface BatchedTrade {
  tokenAddress: string;
  signature: string;
  logIndex: number;
  uniqueTradeId: string;
  blockNumber: string;
  blockId: string;
  commitState: 'proposed' | 'finalized' | 'verified';
  trader: string;
  isBuy: boolean;
  wmonAmount: number;
  tokenAmount: number;
  pricePerToken: number;
  usdAmount: number;
  amountIn?: number;
  amountOut?: number;
  inAsset?: string;
  eventSignature?: string;
  source?: string;
  isCreatorTrade: boolean;
  timestamp: Date;
  curveProgress?: number;
  marketCap?: number;
  liquidityUsd?: number;
  amountWmonRaw?: number;
  amountTokenRaw?: number;
  virtualWmonReserve?: number;
  virtualTokenReserve?: number;
  usdSpotPrice?: number;
}

export interface BatchedToken {
  platform: string;
  signature: string;
  creator: string;
  token: string;
  bondingCurve: string;
  blockNumber: string;
  blockId: string;
  commitState: 'proposed' | 'finalized' | 'verified';
  timestamp: Date;
  name?: string;
  symbol?: string;
}

export class BatchDatabaseWriter {
  private tradeQueue: BatchedTrade[] = [];
  private tokenQueue: BatchedToken[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    private prisma: PrismaClient,
    private batchSize: number = BLOCKCHAIN_CONFIG.DB_BATCH_SIZE,
    private flushIntervalMs: number = 1000 // Flush every second
  ) {
    this.startAutoFlush();
  }

  /**
   * Add trade to batch queue
   */
  async enqueueTrade(trade: BatchedTrade): Promise<void> {
    this.tradeQueue.push(trade);

    // Auto-flush if batch is full
    if (this.tradeQueue.length >= this.batchSize) {
      await this.flushTrades();
    }
  }

  /**
   * Add token to batch queue
   */
  async enqueueToken(token: BatchedToken): Promise<void> {
    this.tokenQueue.push(token);

    // Auto-flush if batch is full
    if (this.tokenQueue.length >= this.batchSize) {
      await this.flushTokens();
    }
  }

  /**
   * Flush trades immediately
   */
  async flushTrades(): Promise<void> {
    if (this.tradeQueue.length === 0 || this.isProcessing) return;

    this.isProcessing = true;
    const batch = this.tradeQueue.splice(0, this.batchSize);

    try {
      const startTime = Date.now();

      // Use transaction for consistency
      await this.prisma.$transaction(
        batch.map(trade =>
          this.prisma.monadTokenTrade.upsert({
            where: { uniqueTradeId: trade.uniqueTradeId },
            create: trade,
            update: {
              commitState: trade.commitState,
              blockNumber: trade.blockNumber,
              blockId: trade.blockId,
              timestamp: trade.timestamp,
              virtualWmonReserve: trade.virtualWmonReserve,
              virtualTokenReserve: trade.virtualTokenReserve,
              curveProgress: trade.curveProgress,
              marketCap: trade.marketCap,
              liquidityUsd: trade.liquidityUsd,
              usdSpotPrice: trade.usdSpotPrice
            }
          })
        )
      );

      const duration = Date.now() - startTime;
      console.log(`💾 DB BATCH: Wrote ${batch.length} trades in ${duration}ms (${Math.round(batch.length / (duration / 1000))} trades/sec)`);

    } catch (error) {
      console.error('❌ DB BATCH: Failed to write trades:', error);
      // Re-queue failed trades
      this.tradeQueue.unshift(...batch);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Flush tokens immediately
   */
  async flushTokens(): Promise<void> {
    if (this.tokenQueue.length === 0 || this.isProcessing) return;

    this.isProcessing = true;
    const batch = this.tokenQueue.splice(0, this.batchSize);

    try {
      const startTime = Date.now();

      // Use transaction for consistency
      await this.prisma.$transaction(
        batch.map(token =>
          this.prisma.monadLaunchedToken.upsert({
            where: { token: token.token },
            create: token,
            update: {
              bondingCurve: token.bondingCurve,
              name: token.name,
              symbol: token.symbol,
              commitState: token.commitState
            }
          })
        )
      );

      const duration = Date.now() - startTime;
      console.log(`💾 DB BATCH: Wrote ${batch.length} tokens in ${duration}ms`);

    } catch (error) {
      console.error('❌ DB BATCH: Failed to write tokens:', error);
      // Re-queue failed tokens
      this.tokenQueue.unshift(...batch);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic periodic flushing
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushAll();
    }, this.flushIntervalMs);
  }

  /**
   * Flush all queues
   */
  async flushAll(): Promise<void> {
    await Promise.all([
      this.flushTrades(),
      this.flushTokens()
    ]);
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      tradesQueued: this.tradeQueue.length,
      tokensQueued: this.tokenQueue.length,
      isProcessing: this.isProcessing,
      batchSize: this.batchSize
    };
  }

  /**
   * Shutdown - flush remaining data and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush any remaining data
    await this.flushAll();

    console.log('💾 DB BATCH: Shutdown complete');
  }
}

/**
 * Batch update token stats (aggregated)
 */
export async function batchUpdateTokenStats(
  prisma: PrismaClient,
  tokenAddresses: string[]
): Promise<void> {
  if (tokenAddresses.length === 0) return;

  const startTime = Date.now();

  try {
    // Get aggregated stats for all tokens in a single query
    const stats = await prisma.monadTokenTrade.groupBy({
      by: ['tokenAddress'],
      where: {
        tokenAddress: { in: tokenAddresses },
        commitState: { in: ['finalized', 'verified'] }
      },
      _count: { id: true },
      _sum: {
        usdAmount: true,
        wmonAmount: true
      },
      _max: {
        timestamp: true
      }
    });

    // Batch update stats
    await prisma.$transaction(
      stats.map(stat =>
        prisma.monadTokenTradeStats.upsert({
          where: { tokenAddress: stat.tokenAddress },
          create: {
            tokenAddress: stat.tokenAddress,
            totalTxCount: stat._count.id,
            totalUsdVolume: stat._sum.usdAmount?.toString() || '0',
            totalWmonVolume: stat._sum.wmonAmount?.toString() || '0',
            lastTradeTime: stat._max.timestamp || new Date(),
            buyCount: 0,
            sellCount: 0,
            creatorHoldings: '0',
            creatorSold: false,
            proposedTrades: 0,
            finalizedTrades: stat._count.id,
            verifiedTrades: 0
          },
          update: {
            totalTxCount: stat._count.id,
            totalUsdVolume: stat._sum.usdAmount?.toString() || '0',
            totalWmonVolume: stat._sum.wmonAmount?.toString() || '0',
            lastTradeTime: stat._max.timestamp || new Date(),
            finalizedTrades: stat._count.id
          }
        })
      )
    );

    const duration = Date.now() - startTime;
    console.log(`📊 STATS BATCH: Updated ${stats.length} token stats in ${duration}ms`);

  } catch (error) {
    console.error('❌ STATS BATCH: Failed to update token stats:', error);
    throw error;
  }
}
