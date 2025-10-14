/**
 * Materialized View Refresh Script
 * 
 * This script refreshes the token_stats_mv materialized view.
 * It should be run periodically (every 1-5 seconds) to keep
 * statistics up to date for high-performance queries.
 * 
 * Usage:
 *   npm run refresh-views
 *   npm run refresh-views -- --interval 5000
 * 
 * Requirements: 5.5
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RefreshConfig {
  interval?: number; // Refresh interval in milliseconds
  once?: boolean;    // Run once and exit
}

/**
 * Refresh the token statistics materialized view
 */
async function refreshTokenStatsView(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Use CONCURRENTLY to avoid locking the view during refresh
    await prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY token_stats_mv'
    );
    
    const duration = Date.now() - startTime;
    console.log(`✓ Refreshed token_stats_mv in ${duration}ms`);
  } catch (error) {
    console.error('✗ Failed to refresh materialized view:', error);
    throw error;
  }
}

/**
 * Get materialized view statistics
 */
async function getViewStats(): Promise<void> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{
      token_count: number;
      total_trades: bigint;
      total_volume: number;
    }>>(
      `SELECT 
        COUNT(*) as token_count,
        SUM(total_trades) as total_trades,
        SUM(total_usd_volume) as total_volume
       FROM token_stats_mv`
    );

    if (result.length > 0) {
      const stats = result[0];
      if (stats) {
        console.log('\nMaterialized View Statistics:');
        console.log(`  - Tokens: ${stats.token_count}`);
        console.log(`  - Total Trades: ${stats.total_trades}`);
        console.log(`  - Total Volume: $${Number(stats.total_volume).toLocaleString()}`);
      }
    }
  } catch (error) {
    console.error('✗ Failed to get view statistics:', error);
  }
}

/**
 * Get view refresh metadata
 */
async function getViewMetadata(): Promise<void> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{
      schemaname: string;
      matviewname: string;
      matviewowner: string;
      tablespace: string | null;
      hasindexes: boolean;
      ispopulated: boolean;
    }>>(
      `SELECT * FROM pg_matviews WHERE matviewname = 'token_stats_mv'`
    );

    if (result.length > 0) {
      console.log('\nMaterialized View Metadata:');
      console.table(result);
    }
  } catch (error) {
    console.error('✗ Failed to get view metadata:', error);
  }
}

/**
 * Continuous refresh loop
 */
async function continuousRefresh(intervalMs: number): Promise<void> {
  console.log(`Starting continuous refresh (interval: ${intervalMs}ms)`);
  console.log('Press Ctrl+C to stop\n');

  let refreshCount = 0;
  let totalDuration = 0;

  const refresh = async () => {
    try {
      const startTime = Date.now();
      await refreshTokenStatsView();
      const duration = Date.now() - startTime;
      
      refreshCount++;
      totalDuration += duration;
      
      const avgDuration = totalDuration / refreshCount;
      console.log(`  [${new Date().toISOString()}] Refresh #${refreshCount} - Avg: ${avgDuration.toFixed(2)}ms`);
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  // Initial refresh
  await refresh();

  // Set up interval
  const intervalId = setInterval(refresh, intervalMs);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    clearInterval(intervalId);
    
    console.log(`\nRefresh Statistics:`);
    console.log(`  - Total Refreshes: ${refreshCount}`);
    console.log(`  - Average Duration: ${(totalDuration / refreshCount).toFixed(2)}ms`);
    
    await prisma.$disconnect();
    process.exit(0);
  });
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const config: RefreshConfig = {
    interval: 5000, // Default: 5 seconds
    once: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) {
      const value = args[i + 1];
      if (value) config.interval = parseInt(value, 10);
      i++;
    } else if (args[i] === '--once') {
      config.once = true;
    } else if (args[i] === '--stats') {
      await getViewStats();
      await getViewMetadata();
      return;
    } else if (args[i] === '--help') {
      console.log(`
Materialized View Refresh Script

Usage:
  npm run refresh-views [options]

Options:
  --interval <ms>  Refresh interval in milliseconds (default: 5000)
  --once           Run once and exit
  --stats          Show view statistics
  --help           Show this help message

Examples:
  npm run refresh-views
  npm run refresh-views -- --interval 1000
  npm run refresh-views -- --once
  npm run refresh-views -- --stats
      `);
      return;
    }
  }

  console.log('='.repeat(60));
  console.log('Materialized View Refresh Script');
  console.log('='.repeat(60));

  try {
    if (config.once) {
      console.log('Running single refresh...\n');
      await refreshTokenStatsView();
      await getViewStats();
      console.log('\n✓ Refresh completed successfully');
    } else {
      await continuousRefresh(config.interval!);
    }
  } catch (error) {
    console.error('\n✗ Refresh failed:', error);
    process.exit(1);
  } finally {
    if (config.once) {
      await prisma.$disconnect();
    }
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
