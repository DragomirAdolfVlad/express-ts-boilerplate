#!/usr/bin/env ts-node
/**
 * NAD.FUN ONLY Script
 * 
 * This script:
 * 1. Deletes ALL non-nad.fun tokens from database
 * 2. Only keeps tokens with proper nad.fun bonding curve
 * 3. Populates metadata ONLY for nad.fun tokens using nad.fun API
 * 
 * NO MORE DEALING WITH RANDOM MONAD TOKENS!
 */

import { PrismaClient } from '@prisma/client';
import { TokenMetadataService } from '../src/infrastructure/metadata/token-metadata.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function nadFunOnly() {
    console.log('🎯 NAD.FUN ONLY - Cleaning House!\n');

    const prisma = new PrismaClient();
    const rpcUrl = process.env.MONAD_HTTP_URL!;
    const metadataService = new TokenMetadataService(rpcUrl);
    const nadFunBondingCurve = process.env.BONDING_CURVE_ADDRESS!;

    try {
        await prisma.$connect();
        console.log('✅ Connected to database');

        // Step 1: Count current tokens
        const totalTokens = await prisma.monadLaunchedToken.count();
        const nadFunTokens = await prisma.monadLaunchedToken.count({
            where: {
                bondingCurve: nadFunBondingCurve
            }
        });
        const trashTokens = totalTokens - nadFunTokens;

        console.log(`📊 Current database status:`);
        console.log(`   Total tokens: ${totalTokens}`);
        console.log(`   NAD.FUN tokens: ${nadFunTokens}`);
        console.log(`   TRASH tokens (non-nad.fun): ${trashTokens}\n`);

        // Step 2: DELETE ALL NON-NAD.FUN TOKENS
        if (trashTokens > 0) {
            console.log('🗑️  DELETING ALL NON-NAD.FUN TOKENS...');
            
            // Delete related trades first
            const deletedTrades = await prisma.monadTokenTrade.deleteMany({
                where: {
                    token: {
                        bondingCurve: {
                            not: nadFunBondingCurve
                        }
                    }
                }
            });
            console.log(`   Deleted ${deletedTrades.count} trades from non-nad.fun tokens`);

            // Delete archived trades
            const deletedArchivedTrades = await prisma.archivedMonadTokenTrade.deleteMany({
                where: {
                    token: {
                        bondingCurve: {
                            not: nadFunBondingCurve
                        }
                    }
                }
            });
            console.log(`   Deleted ${deletedArchivedTrades.count} archived trades from non-nad.fun tokens`);

            // Delete token stats
            const deletedStats = await prisma.monadTokenTradeStats.deleteMany({
                where: {
                    token: {
                        bondingCurve: {
                            not: nadFunBondingCurve
                        }
                    }
                }
            });
            console.log(`   Deleted ${deletedStats.count} token stats from non-nad.fun tokens`);

            // Delete metadata for non-nad.fun tokens
            const tokensToDelete = await prisma.monadLaunchedToken.findMany({
                where: {
                    bondingCurve: {
                        not: nadFunBondingCurve
                    }
                },
                select: { metadataId: true }
            });

            const metadataIdsToDelete = tokensToDelete
                .filter(t => t.metadataId)
                .map(t => t.metadataId!);

            if (metadataIdsToDelete.length > 0) {
                const deletedMetadata = await prisma.monadTokenMetadata.deleteMany({
                    where: {
                        id: { in: metadataIdsToDelete }
                    }
                });
                console.log(`   Deleted ${deletedMetadata.count} metadata records from non-nad.fun tokens`);
            }

            // Finally delete the tokens themselves
            const deletedTokens = await prisma.monadLaunchedToken.deleteMany({
                where: {
                    bondingCurve: {
                        not: nadFunBondingCurve
                    }
                }
            });
            console.log(`   Deleted ${deletedTokens.count} non-nad.fun tokens\n`);
        }

        // Step 3: Show remaining nad.fun tokens
        const remainingTokens = await prisma.monadLaunchedToken.findMany({
            include: { metadata: true },
            orderBy: { createdAt: 'desc' }
        });

        console.log(`🎯 REMAINING NAD.FUN TOKENS: ${remainingTokens.length}\n`);

        if (remainingTokens.length === 0) {
            console.log('ℹ️  No nad.fun tokens found. Database is clean and ready for nad.fun tokens only!');
            return;
        }

        // Step 4: Populate metadata for nad.fun tokens
        console.log('🚀 POPULATING METADATA FOR NAD.FUN TOKENS...\n');

        let updated = 0;
        let failed = 0;

        for (const token of remainingTokens) {
            console.log(`🔄 Processing nad.fun token: ${token.token}`);

            try {
                // Fetch metadata from nad.fun API
                const metadata = await metadataService.getTokenMetadata(token.token);

                // Prepare metadata
                const metadataData: any = {
                    name: metadata.name || 'Unknown NAD.FUN Token',
                    symbol: metadata.symbol || 'NAD'
                };

                if (metadata.description) metadataData.description = metadata.description;
                if (metadata.image) metadataData.image = metadata.image;
                if (metadata.website) metadataData.website = { url: metadata.website };
                if (metadata.twitter) metadataData.twitter = metadata.twitter;
                if (metadata.telegram) metadataData.telegram = metadata.telegram;

                // Update or create metadata
                if (token.metadata) {
                    await prisma.monadTokenMetadata.update({
                        where: { id: token.metadata.id },
                        data: metadataData
                    });
                } else {
                    const newMetadata = await prisma.monadTokenMetadata.create({
                        data: metadataData
                    });

                    await prisma.monadLaunchedToken.update({
                        where: { id: token.id },
                        data: { metadataId: newMetadata.id }
                    });
                }

                // Update token name/symbol if we got better data
                const tokenUpdateData: any = {};
                if (metadata.name && metadata.name !== token.name) {
                    tokenUpdateData.name = metadata.name;
                }
                if (metadata.symbol && metadata.symbol !== token.symbol) {
                    tokenUpdateData.symbol = metadata.symbol;
                }

                if (Object.keys(tokenUpdateData).length > 0) {
                    await prisma.monadLaunchedToken.update({
                        where: { id: token.id },
                        data: tokenUpdateData
                    });
                }

                console.log(`✅ Updated nad.fun token metadata:`, {
                    name: metadata.name,
                    symbol: metadata.symbol,
                    hasDescription: !!metadata.description,
                    hasImage: !!metadata.image,
                    hasSocials: !!(metadata.twitter || metadata.telegram)
                });
                updated++;

            } catch (error) {
                console.error(`❌ Failed to process nad.fun token:`, error);
                failed++;
            }
        }

        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('🎯 NAD.FUN ONLY - MISSION COMPLETE!');
        console.log('='.repeat(60));
        console.log(`Database now contains ONLY nad.fun tokens: ${remainingTokens.length}`);
        console.log(`✅ Successfully updated: ${updated}`);
        console.log(`❌ Failed to update: ${failed}`);
        console.log('\n🚀 Your tracker now ONLY deals with nad.fun tokens!');
        console.log('   No more random Monad blockchain noise!');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('❌ Fatal error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

nadFunOnly().catch(console.error);