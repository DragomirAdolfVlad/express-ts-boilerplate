/**
 * Proposed Block Tracker
 * 
 * Ultra-fast trade tracking using proposed blocks (400ms faster than finalized)
 * with automatic rollback mechanism for rejected blocks
 */
import { JsonRpcProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

interface ProposedTrade {
  id: string;
  signature: string;
  logIndex: number;
  blockNumber: string;
  timestamp: Date;
  isOptimistic: boolean;
}

export class ProposedBlockTracker {
  private optimisticTrades = new Map<string, ProposedTrade>();
  // Removed unused rollbackQueue - rollbacks are handled immediately
  private rejectionRate = 0;
  private totalProcessed = 0;
  private totalRollbacks = 0;

  constructor(
    private provider: JsonRpcProvider,
    private prisma: PrismaClient
  ) {}

  /**
   * Process trade optimistically from proposed block
   */
  async processOptimisticTrade(
    signature: string,
    logIndex: number,
    tradeData: any
  ): Promise<void> {
    try {
      const tradeId = `${signature}:${logIndex}`;
      
      // Mark as optimistic
      const optimisticTrade: ProposedTrade = {
        id: tradeId,
        signature,
        logIndex,
        blockNumber: tradeData.blockNumber,
        timestamp: new Date(),
        isOptimistic: true
      };

      // Store in optimistic cache
      this.optimisticTrades.set(tradeId, optimisticTrade);

      // Process immediately with proposed state
      await this.processTrade({
        ...tradeData,
        commitState: 'proposed',
        isOptimistic: true
      });

      console.log(`⚡ OPTIMISTIC: Processed trade ${tradeId} in proposed block ${tradeData.blockNumber}`);
      
      // Schedule finalization check
      setTimeout(() => this.checkFinalization(tradeId), 500); // Check after 500ms
      
    } catch (error) {
      console.error(`❌ OPTIMISTIC: Failed to process ${signature}:${logIndex}:`, error);
    }
  }

  /**
   * Check if optimistic trade was finalized or needs rollback
   */
  private async checkFinalization(tradeId: string): Promise<void> {
    try {
      const optimisticTrade = this.optimisticTrades.get(tradeId);
      if (!optimisticTrade) return;

      // Get current block to check if our block was finalized
      const currentBlock = await this.provider.getBlockNumber();
      const tradeBlockNum = parseInt(optimisticTrade.blockNumber);
      
      // If block is old enough, it should be finalized
      if (currentBlock > tradeBlockNum + 2) {
        // Check if trade exists in finalized state
        const finalizedTrade = await this.prisma.monadTokenTrade.findUnique({
          where: { uniqueTradeId: tradeId },
          select: { commitState: true }
        });

        if (finalizedTrade && finalizedTrade.commitState !== 'proposed') {
          // Trade was finalized - update state
          await this.confirmOptimisticTrade(tradeId);
        } else {
          // Trade was rejected - rollback
          await this.rollbackOptimisticTrade(tradeId);
        }
      } else {
        // Still too early, check again later
        setTimeout(() => this.checkFinalization(tradeId), 300);
      }
      
    } catch (error) {
      console.error(`❌ FINALIZATION: Error checking ${tradeId}:`, error);
    }
  }

  /**
   * Confirm optimistic trade was finalized
   */
  private async confirmOptimisticTrade(tradeId: string): Promise<void> {
    try {
      // Update to finalized state
      await this.prisma.monadTokenTrade.update({
        where: { uniqueTradeId: tradeId },
        data: { 
          commitState: 'finalized',
          updatedAt: new Date()
        }
      });

      // Remove from optimistic cache
      this.optimisticTrades.delete(tradeId);
      this.totalProcessed++;

      console.log(`✅ CONFIRMED: Trade ${tradeId} finalized successfully`);
      
    } catch (error) {
      console.error(`❌ CONFIRM: Error confirming ${tradeId}:`, error);
    }
  }

  /**
   * Rollback rejected optimistic trade
   */
  private async rollbackOptimisticTrade(tradeId: string): Promise<void> {
    try {
      // Delete the optimistic trade
      await this.prisma.monadTokenTrade.delete({
        where: { uniqueTradeId: tradeId }
      });

      // Update stats
      this.optimisticTrades.delete(tradeId);
      this.totalRollbacks++;
      this.totalProcessed++;
      this.rejectionRate = (this.totalRollbacks / this.totalProcessed) * 100;

      console.log(`🔄 ROLLBACK: Trade ${tradeId} was rejected (rejection rate: ${this.rejectionRate.toFixed(2)}%)`);

      // Alert if rejection rate is too high
      if (this.rejectionRate > 5 && this.totalProcessed > 50) {
        console.warn(`⚠️  HIGH REJECTION RATE: ${this.rejectionRate.toFixed(2)}% - Consider switching to finalized blocks`);
      }
      
    } catch (error) {
      console.error(`❌ ROLLBACK: Error rolling back ${tradeId}:`, error);
    }
  }

  /**
   * Process trade with optimistic flag
   */
  private async processTrade(tradeData: any): Promise<void> {
    // Use existing trade processing logic but mark as optimistic
    const uniqueTradeId = `${tradeData.signature}:${tradeData.logIndex}`;
    
    await this.prisma.monadTokenTrade.upsert({
      where: { uniqueTradeId },
      create: {
        ...tradeData,
        uniqueTradeId,
        // Add optimistic flag to track these trades
        source: tradeData.isOptimistic ? 'curve_optimistic' : 'curve'
      },
      update: {
        commitState: tradeData.commitState,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalProcessed: number;
    totalRollbacks: number;
    rejectionRate: number;
    optimisticPending: number;
    avgLatencyImprovement: number;
  } {
    return {
      totalProcessed: this.totalProcessed,
      totalRollbacks: this.totalRollbacks,
      rejectionRate: this.rejectionRate,
      optimisticPending: this.optimisticTrades.size,
      avgLatencyImprovement: 400 // ms saved vs finalized blocks
    };
  }

  /**
   * Check if system should fallback to finalized blocks
   */
  shouldFallbackToFinalized(): boolean {
    return this.rejectionRate > 5 && this.totalProcessed > 100;
  }

  /**
   * Clean up old optimistic trades
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [tradeId, trade] of this.optimisticTrades.entries()) {
      if (now - trade.timestamp.getTime() > maxAge) {
        console.warn(`🧹 CLEANUP: Removing stale optimistic trade ${tradeId}`);
        this.optimisticTrades.delete(tradeId);
      }
    }
  }
}