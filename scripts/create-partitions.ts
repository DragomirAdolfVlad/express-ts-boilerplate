/**
 * Automatic Partition Creation Script
 * 
 * This script creates daily partitions for the monad_token_trades table.
 * It should be run daily via cron job or scheduled task to ensure
 * partitions exist for future dates.
 * 
 * Usage:
 *   npm run create-partitions
 *   npm run create-partitions -- --days 30
 * 
 * Requirements: 5.1, 5.6, 5.7
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PartitionConfig {
  daysAhead: number;
  daysToKeep: number;
}

/**
 * Format date as YYYY-MM-DD for partition naming
 */
function formatDateForPartition(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}_${month}_${day}`;
}

/**
 * Format date as YYYY-MM-DD HH:MM:SS for SQL
 */
function formatDateForSQL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} 00:00:00`;
}

/**
 * Check if a partition exists
 */
async function partitionExists(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename = $1
    ) as exists`,
    tableName
  );
  return result[0]?.exists || false;
}

/**
 * Create a single partition for a specific date
 */
async function createPartition(date: Date): Promise<void> {
  const partitionName = `monad_token_trades_${formatDateForPartition(date)}`;
  
  // Check if partition already exists
  if (await partitionExists(partitionName)) {
    console.log(`✓ Partition ${partitionName} already exists`);
    return;
  }

  const startDate = formatDateForSQL(date);
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  const endDate = formatDateForSQL(nextDate);

  const sql = `
    CREATE TABLE IF NOT EXISTS ${partitionName}
    PARTITION OF monad_token_trades
    FOR VALUES FROM ('${startDate}') TO ('${endDate}');
  `;

  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`✓ Created partition: ${partitionName} (${startDate} to ${endDate})`);
  } catch (error) {
    console.error(`✗ Failed to create partition ${partitionName}:`, error);
    throw error;
  }
}

/**
 * Create partitions for the next N days
 */
async function createFuturePartitions(daysAhead: number): Promise<void> {
  console.log(`\nCreating partitions for the next ${daysAhead} days...`);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    await createPartition(date);
  }
}

/**
 * List all existing partitions
 */
async function listPartitions(): Promise<void> {
  const result = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename 
     FROM pg_tables 
     WHERE schemaname = 'public' 
     AND tablename LIKE 'monad_token_trades_%'
     AND tablename != 'monad_token_trades_default'
     ORDER BY tablename`
  );

  console.log('\nExisting partitions:');
  result.forEach((row) => {
    console.log(`  - ${row.tablename}`);
  });
  console.log(`Total: ${result.length} partitions`);
}

/**
 * Drop old partitions to save space
 */
async function dropOldPartitions(daysToKeep: number): Promise<void> {
  console.log(`\nDropping partitions older than ${daysToKeep} days...`);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  cutoffDate.setHours(0, 0, 0, 0);

  const result = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename 
     FROM pg_tables 
     WHERE schemaname = 'public' 
     AND tablename LIKE 'monad_token_trades_2%'
     AND tablename != 'monad_token_trades_default'
     ORDER BY tablename`
  );

  let droppedCount = 0;
  for (const row of result) {
    // Extract date from partition name (format: monad_token_trades_YYYY_MM_DD)
    const match = row.tablename.match(/monad_token_trades_(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      if (!year || !month || !day) continue;
      const partitionDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      if (partitionDate < cutoffDate) {
        try {
          await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${row.tablename}`);
          console.log(`✓ Dropped old partition: ${row.tablename}`);
          droppedCount++;
        } catch (error) {
          console.error(`✗ Failed to drop partition ${row.tablename}:`, error);
        }
      }
    }
  }

  if (droppedCount === 0) {
    console.log('No old partitions to drop');
  } else {
    console.log(`Dropped ${droppedCount} old partitions`);
  }
}

/**
 * Get partition statistics
 */
async function getPartitionStats(): Promise<void> {
  console.log('\nPartition Statistics:');
  
  const result = await prisma.$queryRawUnsafe<Array<{
    tablename: string;
    row_count: number;
    total_size: string;
  }>>(
    `SELECT 
      c.relname as tablename,
      c.reltuples::bigint as row_count,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
     AND c.relname LIKE 'monad_token_trades_%'
     AND c.relkind = 'r'
     ORDER BY c.relname`
  );

  console.table(result);
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const config: PartitionConfig = {
    daysAhead: 30, // Create partitions for next 30 days by default
    daysToKeep: 90, // Keep partitions for 90 days by default
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      const value = args[i + 1];
      if (value) config.daysAhead = parseInt(value, 10);
      i++;
    } else if (args[i] === '--keep' && args[i + 1]) {
      const value = args[i + 1];
      if (value) config.daysToKeep = parseInt(value, 10);
      i++;
    } else if (args[i] === '--list') {
      await listPartitions();
      await getPartitionStats();
      return;
    } else if (args[i] === '--stats') {
      await getPartitionStats();
      return;
    } else if (args[i] === '--help') {
      console.log(`
Automatic Partition Creation Script

Usage:
  npm run create-partitions [options]

Options:
  --days <n>     Create partitions for next N days (default: 30)
  --keep <n>     Keep partitions for last N days (default: 90)
  --list         List all existing partitions
  --stats        Show partition statistics
  --help         Show this help message

Examples:
  npm run create-partitions
  npm run create-partitions -- --days 60
  npm run create-partitions -- --days 30 --keep 60
  npm run create-partitions -- --list
  npm run create-partitions -- --stats
      `);
      return;
    }
  }

  console.log('='.repeat(60));
  console.log('Automatic Partition Creation Script');
  console.log('='.repeat(60));
  console.log(`Configuration:`);
  console.log(`  - Days ahead: ${config.daysAhead}`);
  console.log(`  - Days to keep: ${config.daysToKeep}`);
  console.log('='.repeat(60));

  try {
    // Create future partitions
    await createFuturePartitions(config.daysAhead);

    // Drop old partitions
    await dropOldPartitions(config.daysToKeep);

    // List current partitions
    await listPartitions();

    // Show statistics
    await getPartitionStats();

    console.log('\n✓ Partition management completed successfully');
  } catch (error) {
    console.error('\n✗ Partition management failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
