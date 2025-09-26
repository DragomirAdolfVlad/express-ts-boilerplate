#!/usr/bin/env ts-node
/**
 * Simple Token Metadata Population Script
 */

import { PrismaClient } from '@prisma/client';
import { TokenMetadataService } from '../src/infrastructure/metadata/token-metadata.service';
import { MonadTokenRepositoryImpl } from '../src/infrastructure/database/monad-token.repository';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function populateMetadata() {
    console.log('🚀 Starting Token Metadata Population');
    
    // Parse simple arguments
    const args = process.argv.slice(2);
    let limit = 5;
    const limitIndex = args.indexOf('--limit');
    if (limitIndex !== -1 && limitIndex + 1 < args.length) {
        const limitArg = args[limitIndex + 1];
        if (limitArg) {
            const limitValue = parseInt(limitArg);
            if (!isNaN(limitValue)) {
                limit = limitValue;
            }
        }
    }
    const dryRun = args.includes('--dry-run');
    const verbose = args.includes('--verbose');
    
    console.log(`Options: limit=${limit}, dryRun=${dryRun}, verbose=${verbose}`);
    console.log('');

    try {
        // Initialize services
        const prisma = new PrismaClient();
        const rpcUrl = process.env['MONAD_HTTP_URL'] || process.env['MONAD_RPC'];
        
        if (!rpcUrl) {
            throw new Error('MONAD_HTTP_URL or MONAD_RPC environment variable is required');
        }
        
        console.log(`🔗 Using RPC: ${rpcUrl.substring(0, 50)}...`);
        const metadataService = new TokenMetadataService(rpcUrl);
        const repository = new MonadTokenRepositoryImpl(prisma);

        await prisma.$connect();
        console.log('✅ Connected to database');

        // Get tokens without metadata
        const tokens = await prisma.monadLaunchedToken.findMany({
            where: { metadataId: null },
            select: {
                token: true,
                name: true,
                symbol: true,
                creator: true,
                bondingCurve: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        console.log(`📊 Found ${tokens.length} tokens without metadata`);
        
        if (tokens.length === 0) {
            console.log('ℹ️  No tokens need metadata updates');
            return;
        }

        console.log('');
        let updated = 0;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (!token) continue;
            
            console.log(`[${i + 1}/${tokens.length}] Processing: ${token.token}`);

            if (dryRun) {
                console.log('   [DRY RUN] Would fetch metadata');
                continue;
            }

            try {
                // Fetch metadata
                const metadata = await metadataService.getTokenMetadata(token.token, {
                    name: token.name,
                    symbol: token.symbol,
                    creator: token.creator,
                    bondingCurve: token.bondingCurve
                });

                // Check if we got enhanced metadata
                const hasEnhanced = metadata.description || metadata.image || metadata.website || 
                                  metadata.twitter || metadata.telegram;

                if (hasEnhanced) {
                    // Update metadata
                    await repository.updateTokenMetadata(token.token, {
                        name: metadata.name,
                        symbol: metadata.symbol,
                        description: metadata.description,
                        image: metadata.image,
                        website: metadata.website,
                        twitter: metadata.twitter,
                        telegram: metadata.telegram
                    });

                    updated++;
                    console.log(`   ✅ Updated with enhanced metadata`);
                    
                    if (verbose) {
                        console.log(`      Name: ${metadata.name}`);
                        console.log(`      Symbol: ${metadata.symbol}`);
                        console.log(`      Has Image: ${!!metadata.image}`);
                        console.log(`      Has Description: ${!!metadata.description}`);
                        console.log(`      Has Website: ${!!metadata.website}`);
                        console.log(`      Has Socials: ${!!(metadata.twitter || metadata.telegram)}`);
                    }
                } else {
                    console.log(`   ⏭️  No enhanced metadata found`);
                }

                // Small delay to avoid overwhelming RPC
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
            }
        }

        console.log('\n📈 Summary:');
        console.log(`   Processed: ${tokens.length}`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped: ${tokens.length - updated}`);

        await prisma.$disconnect();
        console.log('\n👋 Disconnected from database');

    } catch (error) {
        console.error('💥 Script failed:', error);
        process.exit(1);
    }
}

// Run immediately
populateMetadata();