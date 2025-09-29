#!/usr/bin/env ts-node

/**
 * Clear Bad Data Script
 * 
 * Deletes all existing trades and tokens with incorrect USD calculations
 * so we can start fresh with the corrected pricing system.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function clearBadData() {
  try {
    console.log('🧹 Starting data cleanup...');

    // Delete all trades (they have wrong USD calculations)
    console.log('🗑️  Deleting all trades with incorrect USD calculations...');
    const deletedTrades = await prisma.monadTokenTrade.deleteMany({});
    console.log(`✅ Deleted ${deletedTrades.count} trades`);

    // Delete all trade stats (they're based on wrong data)
    console.log('🗑️  Deleting all trade statistics...');
    const deletedStats = await prisma.monadTokenTradeStats.deleteMany({});
    console.log(`✅ Deleted ${deletedStats.count} trade stat records`);

    // Delete archived trades (they have wrong USD calculations)
    console.log('🗑️  Deleting archived trades with incorrect data...');
    const deletedArchivedTrades = await prisma.archivedMonadTokenTrade.deleteMany({});
    console.log(`✅ Deleted ${deletedArchivedTrades.count} archived trades`);

    // Delete archived tokens (they have wrong final market caps)
    console.log('🗑️  Deleting archived tokens with incorrect data...');
    const deletedArchivedTokens = await prisma.archivedMonadLaunchedToken.deleteMany({});
    console.log(`✅ Deleted ${deletedArchivedTokens.count} archived tokens`);

    console.log('');
    console.log('🎉 Data cleanup completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   • Trades deleted: ${deletedTrades.count}`);
    console.log(`   • Trade stats deleted: ${deletedStats.count}`);
    console.log(`   • Archived trades deleted: ${deletedArchivedTrades.count}`);
    console.log(`   • Archived tokens deleted: ${deletedArchivedTokens.count}`);
    console.log('');
    console.log('✨ Ready for fresh data with correct USD calculations!');

  } catch (error) {
    console.error('❌ Error during data cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
clearBadData().catch(console.error);