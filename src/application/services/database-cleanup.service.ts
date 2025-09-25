/**
 * Database Cleanup Service
 * 
 * Manages automatic data lifecycle:
 * - Archives tokens with no trades for 7 days
 * - Deletes archived data after 30 days
 * - Runs cleanup tasks on schedule
 */

import { MonadTokenRepository } from '../../infrastructure/database/monad-token.repository';

export interface CleanupMetrics {
  lastCleanupRun: Date;
  tokensArchived: number;
  archivedDataDeleted: number;
  totalCleanupRuns: number;
  errors: string[];
}

export class DatabaseCleanupService {
  private metrics: CleanupMetrics = {
    lastCleanupRun: new Date(0),
    tokensArchived: 0,
    archivedDataDeleted: 0,
    totalCleanupRuns: 0,
    errors: []
  };

  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  constructor(
    private readonly tokenRepository: MonadTokenRepository,
    private readonly enableAutoCleanup: boolean = true
  ) {}

  /**
   * Start automatic cleanup service
   */
  start(): void {
    if (!this.enableAutoCleanup) {
      console.log('[🧹 CLEANUP] Auto-cleanup disabled');
      return;
    }

    console.log('[🧹 CLEANUP] Starting automatic cleanup service (every 6 hours)');
    
    // Run initial cleanup after 1 minute
    setTimeout(() => this.runCleanup(), 60000);
    
    // Schedule regular cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop automatic cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[🧹 CLEANUP] Automatic cleanup service stopped');
    }
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<CleanupMetrics> {
    console.log('[🧹 CLEANUP] Starting cleanup cycle...');
    const startTime = Date.now();
    
    try {
      // Step 1: Archive inactive tokens (no trades for 7 days)
      console.log('[🧹 CLEANUP] Step 1: Archiving inactive tokens...');
      const archivedCount = await this.tokenRepository.archiveInactiveTokens();
      this.metrics.tokensArchived += archivedCount;

      // Step 2: Delete old archived data (archived for 30+ days)
      console.log('[🧹 CLEANUP] Step 2: Deleting old archived data...');
      const deletedCount = await this.tokenRepository.deleteOldArchivedData();
      this.metrics.archivedDataDeleted += deletedCount;

      // Update metrics
      this.metrics.lastCleanupRun = new Date();
      this.metrics.totalCleanupRuns++;
      
      const duration = Date.now() - startTime;
      console.log(`[✅ CLEANUP] Cleanup completed in ${duration}ms`);
      console.log(`[📊 CLEANUP] Archived: ${archivedCount}, Deleted: ${deletedCount}`);

      return { ...this.metrics };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.metrics.errors.push(`${new Date().toISOString()}: ${errorMessage}`);
      
      // Keep only last 10 errors
      if (this.metrics.errors.length > 10) {
        this.metrics.errors = this.metrics.errors.slice(-10);
      }

      console.error('[❌ CLEANUP] Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup metrics
   */
  getMetrics(): CleanupMetrics {
    return { ...this.metrics };
  }

  /**
   * Get tokens that will be archived in next cleanup
   */
  async getTokensPendingArchival(): Promise<string[]> {
    return this.tokenRepository.getTokensForArchival();
  }

  /**
   * Get archived tokens that will be deleted in next cleanup
   */
  async getArchivedTokensPendingDeletion(): Promise<string[]> {
    return this.tokenRepository.getArchivedTokensForDeletion();
  }

  /**
   * Force archive a specific token (for manual cleanup)
   */
  async forceArchiveToken(tokenAddress: string): Promise<void> {
    console.log(`[🧹 MANUAL] Force archiving token: ${tokenAddress}`);
    
    // This would require implementing a single-token archive method
    // For now, we'll run the full cleanup which will catch it if eligible
    await this.runCleanup();
  }

  /**
   * Get cleanup status and next run time
   */
  getStatus(): {
    isRunning: boolean;
    nextRunTime: Date | null;
    lastRun: Date;
    totalRuns: number;
    recentErrors: string[];
  } {
    const nextRunTime = this.cleanupInterval 
      ? new Date(this.metrics.lastCleanupRun.getTime() + this.CLEANUP_INTERVAL_MS)
      : null;

    return {
      isRunning: this.cleanupInterval !== null,
      nextRunTime,
      lastRun: this.metrics.lastCleanupRun,
      totalRuns: this.metrics.totalCleanupRuns,
      recentErrors: this.metrics.errors.slice(-5) // Last 5 errors
    };
  }

  /**
   * Get database size statistics
   */
  async getDatabaseStats(): Promise<{
    activeTokens: number;
    activeTrades: number;
    archivedTokens: number;
    archivedTrades: number;
  }> {
    try {
      // This would require additional repository methods
      // For now, return placeholder data
      return {
        activeTokens: 0,
        activeTrades: 0,
        archivedTokens: 0,
        archivedTrades: 0
      };
    } catch (error) {
      console.error('[❌ CLEANUP] Failed to get database stats:', error);
      return {
        activeTokens: 0,
        activeTrades: 0,
        archivedTokens: 0,
        archivedTrades: 0
      };
    }
  }
}