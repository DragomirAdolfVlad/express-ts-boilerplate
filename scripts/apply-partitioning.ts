/**
 * Apply Partitioning Script
 * 
 * This script applies the partitioning migration directly to the database.
 * Use this if `prisma migrate` fails due to shadow database issues.
 * 
 * Usage:
 *   npm run apply-partitioning
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function applyPartitioning() {
  console.log('='.repeat(60));
  console.log('Applying Database Partitioning');
  console.log('='.repeat(60));
  console.log('\nThis will convert monad_token_trades to a partitioned table.');
  console.log('All existing data will be preserved.\n');

  try {
    // Read the migration SQL
    const migrationPath = path.join(
      __dirname,
      '../prisma/migrations/20251009162418_add_table_partitioning/migration.sql'
    );
    
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('Executing migration SQL...\n');
    
    // Split SQL into individual statements and execute them
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        await prisma.$executeRawUnsafe(statement);
      }
    }
    
    console.log('✓ Partitioning applied successfully!\n');
    console.log('Next steps:');
    console.log('  1. Create partitions: npm run create-partitions');
    console.log('  2. Start view refresh: npm run refresh-views');
    console.log('  3. Run tests: npm run test-partitioning\n');
    
  } catch (error) {
    console.error('✗ Failed to apply partitioning:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyPartitioning();
