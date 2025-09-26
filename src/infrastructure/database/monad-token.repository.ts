/**
 * Monad Token Repository
 * 
 * PostgreSQL implementation for Monad token and trade persistence.
 * Based on proven PumpFun tracker patterns.
 */

import { PrismaClient } from '@prisma/client';
import { MonadToken, MonadTrade } from '../../domain/entities/monad-token.entity';

export interface MonadTokenRepository {
    // Token operations
    saveToken(token: MonadToken): Promise<void>;
    findTokenByAddress(address: string): Promise<MonadToken | null>;
    updateTokenMetadata(address: string, metadata: { name?: string; symbol?: string; description?: string; image?: string; website?: string; twitter?: string; telegram?: string }): Promise<void>;

    // Trade operations
    saveTrade(trade: MonadTrade): Promise<void>;
    findTradesByToken(tokenAddress: string, limit?: number): Promise<MonadTrade[]>;
    findTradesByTrader(traderAddress: string, limit?: number): Promise<MonadTrade[]>;

    // Statistics operations
    updateTokenStats(tokenAddress: string): Promise<void>;
    getTokenStats(tokenAddress: string): Promise<any>;

    // Cleanup operations
    archiveInactiveTokens(): Promise<number>;
    deleteOldArchivedData(): Promise<number>;
    getTokensForArchival(): Promise<string[]>;
    getArchivedTokensForDeletion(): Promise<string[]>;
}

export class MonadTokenRepositoryImpl implements MonadTokenRepository {
    constructor(private readonly prisma: PrismaClient) { }

    // =============================================================================
    // TOKEN OPERATIONS
    // =============================================================================

    async saveToken(token: MonadToken): Promise<void> {
        try {
            // Use upsert to handle duplicates gracefully
            await this.prisma.monadLaunchedToken.upsert({
                where: { token: token.address },
                update: {
                    commitState: token.commitState,
                    updatedAt: new Date()
                },
                create: {
                    platform: 'monad',
                    signature: token.blockId, // Use blockId as signature for uniqueness
                    creator: token.creator,
                    token: token.address,
                    bondingCurve: token.bondingCurve,
                    blockNumber: token.blockNumber.toString(),
                    blockId: token.blockId,
                    commitState: token.commitState,
                    timestamp: token.timestamp,
                    name: token.name,
                    symbol: token.symbol
                }
            });

            console.log(`[💾 DB] Token saved successfully: ${token.address}`);
        } catch (error: any) {
            console.error(`[❌ DB] Failed to save token ${token.address}:`, error);
            throw error;
        }
    }

    async findTokenByAddress(address: string): Promise<MonadToken | null> {
        try {
            const dbToken = await this.prisma.monadLaunchedToken.findUnique({
                where: { token: address },
                include: { metadata: true }
            });

            if (!dbToken) return null;

            return new MonadToken({
                address: dbToken.token,
                name: dbToken.name || dbToken.metadata?.name,
                symbol: dbToken.symbol || dbToken.metadata?.symbol,
                creator: dbToken.creator,
                bondingCurve: dbToken.bondingCurve,
                blockNumber: dbToken.blockNumber,
                blockId: dbToken.blockId,
                commitState: dbToken.commitState as any,
                timestamp: dbToken.timestamp
            });
        } catch (error) {
            console.error(`[❌ DB] Failed to find token ${address}:`, error);
            return null;
        }
    }

    async updateTokenMetadata(
        address: string,
        metadata: { name?: string; symbol?: string; description?: string; image?: string; website?: string; twitter?: string; telegram?: string }
    ): Promise<void> {
        try {
            // Update basic token fields
            await this.prisma.monadLaunchedToken.update({
                where: { token: address },
                data: {
                    name: metadata.name,
                    symbol: metadata.symbol,
                    updatedAt: new Date()
                }
            });

            // Create or update detailed metadata if we have extended fields
            if (metadata.description || metadata.image || metadata.website || metadata.twitter || metadata.telegram) {
                // First get the token to see if it has existing metadata
                const token = await this.prisma.monadLaunchedToken.findUnique({
                    where: { token: address },
                    select: { metadataId: true }
                });

                if (token?.metadataId) {
                    // Update existing metadata
                    await this.prisma.monadTokenMetadata.update({
                        where: { id: token.metadataId },
                        data: {
                            name: metadata.name || '',
                            symbol: metadata.symbol || '',
                            description: metadata.description,
                            image: metadata.image,
                            website: metadata.website ? { url: metadata.website } : undefined,
                            twitter: metadata.twitter,
                            telegram: metadata.telegram,
                            updatedAt: new Date()
                        }
                    });
                } else {
                    // Create new metadata record
                    const newMetadata = await this.prisma.monadTokenMetadata.create({
                        data: {
                            name: metadata.name || '',
                            symbol: metadata.symbol || '',
                            description: metadata.description,
                            image: metadata.image,
                            website: metadata.website ? { url: metadata.website } : undefined,
                            twitter: metadata.twitter,
                            telegram: metadata.telegram
                        }
                    });

                    // Link the metadata to the token
                    await this.prisma.monadLaunchedToken.update({
                        where: { token: address },
                        data: { metadataId: newMetadata.id }
                    });
                }
            }

            console.log(`[💾 DB] Token metadata updated: ${address}`, {
                hasDescription: !!metadata.description,
                hasImage: !!metadata.image,
                hasWebsite: !!metadata.website,
                hasSocials: !!(metadata.twitter || metadata.telegram)
            });
        } catch (error) {
            console.error(`[❌ DB] Failed to update token metadata ${address}:`, error);
            throw error;
        }
    }

    // =============================================================================
    // TRADE OPERATIONS
    // =============================================================================

    async saveTrade(trade: MonadTrade): Promise<void> {
        try {
            // First check if token exists - same pattern as PumpFun
            const existingToken = await this.prisma.monadLaunchedToken.findUnique({
                where: { token: trade.tokenAddress },
                select: { token: true }
            });

            if (!existingToken) {
                console.warn(`[⚠️ DB] Token not found, creating minimal record: ${trade.tokenAddress}`);

                // Create minimal token record
                try {
                    await this.prisma.monadLaunchedToken.create({
                        data: {
                            platform: 'monad',
                            signature: `${trade.tokenAddress}_${trade.blockNumber}`,
                            creator: 'unknown',
                            token: trade.tokenAddress,
                            bondingCurve: 'unknown',
                            blockNumber: trade.blockNumber,
                            blockId: trade.blockId || 'unknown',
                            commitState: trade.commitState,
                            timestamp: trade.timestamp
                        }
                    });
                } catch (tokenError) {
                    if (tokenError instanceof Error && tokenError.message.includes('unique constraint')) {
                        // Token was created by another process, continue
                        console.log(`[💾 DB] Token created by another process: ${trade.tokenAddress}`);
                    } else {
                        throw tokenError;
                    }
                }
            }

            // Convert BigInt values to safe numbers - same approach as PumpFun
            const wmonAmount = this.bigIntToNumber(trade.wmonAmount, 9);
            const tokenAmount = this.bigIntToNumber(trade.tokenAmount, 9);
            const pricePerToken = this.bigIntToNumber(trade.pricePerToken, 9);

            // Validate and cap all values to database limits (more conservative)
            const maxDecimal30_9 = 999999999999999999; // For Decimal(30,9) - more conservative limit
            const maxDecimal20_2 = 999999999999999.99; // For Decimal(20,2) - more conservative limit  
            const maxDecimal20_9 = 99999999.999999999; // For Decimal(20,9) - more conservative limit

            // Cap the main trade values
            const cappedWmonAmount = Math.min(wmonAmount, maxDecimal30_9);
            const cappedTokenAmount = Math.min(tokenAmount, maxDecimal30_9);
            const cappedPricePerToken = Math.min(pricePerToken, maxDecimal30_9);

            // Calculate additional fields with validation
            const usdAmount = Math.min(cappedWmonAmount * 3.26, maxDecimal20_2);
            const marketCap = Math.min(cappedTokenAmount * cappedPricePerToken, maxDecimal20_2);
            const liquidityUsd = Math.min(usdAmount, maxDecimal20_2);
            const usdSpotPrice = Math.min(cappedPricePerToken * 3.26, maxDecimal20_9);

            // Log if values were capped
            if (wmonAmount !== cappedWmonAmount || tokenAmount !== cappedTokenAmount || pricePerToken !== cappedPricePerToken) {
                console.warn(`[⚠️ DB] Large values capped for database storage:`, {
                    original: { wmonAmount, tokenAmount, pricePerToken },
                    capped: { cappedWmonAmount, cappedTokenAmount, cappedPricePerToken }
                });
            }

            const curveProgress = this.calculateCurveProgress(trade.reserves);

            // Debug logging for all values being inserted
            console.log(`[🔍 DB] Inserting trade with values:`, {
                cappedWmonAmount,
                cappedTokenAmount,
                cappedPricePerToken,
                usdAmount,
                marketCap,
                liquidityUsd,
                usdSpotPrice,
                curveProgress
            });

            // Insert trade using Prisma model - same pattern as PumpFun
            try {
                await this.prisma.monadTokenTrade.create({
                    data: {
                        tokenAddress: trade.tokenAddress,
                        signature: trade.transactionHash,
                        blockNumber: trade.blockNumber,
                        blockId: trade.blockId || 'unknown',
                        commitState: trade.commitState,
                        trader: trade.trader,
                        isBuy: trade.isBuy,
                        wmonAmount: cappedWmonAmount,
                        tokenAmount: cappedTokenAmount,
                        pricePerToken: cappedPricePerToken,
                        usdAmount: usdAmount,
                        isCreatorTrade: false, // TODO: Determine from creator data
                        timestamp: trade.timestamp,
                        curveProgress: curveProgress,
                        marketCap: marketCap,
                        liquidityUsd: liquidityUsd,
                        reserve1: trade.reserves.reserve1.toString(),
                        reserve2: trade.reserves.reserve2.toString(),
                        reserve3: trade.reserves.reserve3.toString(),
                        reserve4: trade.reserves.reserve4.toString(),
                        usdSpotPrice: usdSpotPrice
                    }
                });
            } catch (dbError) {
                console.error(`[❌ DB] Database insertion failed with values:`, {
                    cappedWmonAmount,
                    cappedTokenAmount,
                    cappedPricePerToken,
                    usdAmount,
                    marketCap,
                    liquidityUsd,
                    usdSpotPrice,
                    curveProgress,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
                throw dbError;
            }

            // Update token statistics
            await this.updateTokenStats(trade.tokenAddress);

            console.log(`[💾 DB] Trade saved: ${trade.tokenAddress} ${trade.isBuy ? 'BUY' : 'SELL'} - WMON: ${wmonAmount}`);
        } catch (error) {
            console.error(`[❌ DB] Failed to save trade:`, error);
            console.error(`[❌ DB] Trade data:`, {
                tokenAddress: trade.tokenAddress,
                trader: trade.trader,
                blockNumber: trade.blockNumber,
                blockId: trade.blockId,
                commitState: trade.commitState,
                wmonAmount: this.bigIntToNumber(trade.wmonAmount, 9),
                tokenAmount: this.bigIntToNumber(trade.tokenAmount, 9)
            });
            throw error;
        }
    }

    private bigIntToNumber(value: bigint, decimals: number): number {
        // Convert BigInt to number safely - same approach as PumpFun
        const stringValue = value.toString();

        if (stringValue.length <= decimals) {
            // Value is less than 1, so it's all decimal places
            const decimalPart = stringValue.padStart(decimals, '0');
            return parseFloat(`0.${decimalPart}`);
        } else {
            // Split into integer and decimal parts
            const integerPart = stringValue.slice(0, -decimals) || '0';
            const decimalPart = stringValue.slice(-decimals);
            return parseFloat(`${integerPart}.${decimalPart}`);
        }
    }

    async findTradesByToken(tokenAddress: string, limit: number = 100): Promise<MonadTrade[]> {
        try {
            const dbTrades = await this.prisma.monadTokenTrade.findMany({
                where: { tokenAddress },
                orderBy: { timestamp: 'desc' },
                take: limit
            });

            return dbTrades.map(dbTrade => new MonadTrade({
                tokenAddress: dbTrade.tokenAddress,
                trader: dbTrade.trader,
                isBuy: dbTrade.isBuy,
                wmonAmount: this.numberToBigInt(Number(dbTrade.wmonAmount), 9),
                tokenAmount: this.numberToBigInt(Number(dbTrade.tokenAmount), 9),
                pricePerToken: this.numberToBigInt(Number(dbTrade.pricePerToken), 9),
                reserves: {
                    reserve1: BigInt(dbTrade.reserve1 || '0'),
                    reserve2: BigInt(dbTrade.reserve2 || '0'),
                    reserve3: BigInt(dbTrade.reserve3 || '0'),
                    reserve4: BigInt(dbTrade.reserve4 || '0')
                },
                blockNumber: dbTrade.blockNumber,
                blockId: dbTrade.blockId,
                commitState: dbTrade.commitState as any,
                timestamp: dbTrade.timestamp,
                transactionHash: dbTrade.signature || ''
            }));
        } catch (error) {
            console.error(`[❌ DB] Failed to find trades for token ${tokenAddress}:`, error);
            return [];
        }
    }

    private numberToBigInt(value: number, decimals: number): bigint {
        const multiplier = Math.pow(10, decimals);
        return BigInt(Math.floor(value * multiplier));
    }

    private calculateCurveProgress(reserves: { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint }): number {
        // Calculate bonding curve progress based on reserves
        // This is a simplified calculation - adjust based on Monad's actual curve formula
        try {
            const totalReserves = Number(reserves.reserve1) + Number(reserves.reserve2) + Number(reserves.reserve3) + Number(reserves.reserve4);
            if (totalReserves === 0) return 0;

            // Simple progress calculation - real reserves vs virtual reserves
            const realReserves = Number(reserves.reserve3) + Number(reserves.reserve4);
            const progress = Math.min(realReserves / totalReserves, 1.0);
            return Math.round(progress * 10000) / 100; // Return as percentage with 2 decimal places
        } catch (error) {
            console.warn('[⚠️ DB] Failed to calculate curve progress, using 0:', error);
            return 0;
        }
    }

    async findTradesByTrader(traderAddress: string, limit: number = 100): Promise<MonadTrade[]> {
        try {
            const dbTrades = await this.prisma.monadTokenTrade.findMany({
                where: { trader: traderAddress },
                orderBy: { timestamp: 'desc' },
                take: limit
            });

            return dbTrades.map(dbTrade => new MonadTrade({
                tokenAddress: dbTrade.tokenAddress,
                trader: dbTrade.trader,
                isBuy: dbTrade.isBuy,
                wmonAmount: this.numberToBigInt(Number(dbTrade.wmonAmount), 9),
                tokenAmount: this.numberToBigInt(Number(dbTrade.tokenAmount), 9),
                pricePerToken: this.numberToBigInt(Number(dbTrade.pricePerToken), 9),
                reserves: {
                    reserve1: BigInt(dbTrade.reserve1 || '0'),
                    reserve2: BigInt(dbTrade.reserve2 || '0'),
                    reserve3: BigInt(dbTrade.reserve3 || '0'),
                    reserve4: BigInt(dbTrade.reserve4 || '0')
                },
                blockNumber: dbTrade.blockNumber,
                blockId: dbTrade.blockId,
                commitState: dbTrade.commitState as any,
                timestamp: dbTrade.timestamp,
                transactionHash: dbTrade.signature || ''
            }));
        } catch (error) {
            console.error(`[❌ DB] Failed to find trades for trader ${traderAddress}:`, error);
            return [];
        }
    }

    // =============================================================================
    // STATISTICS OPERATIONS
    // =============================================================================

    async updateTokenStats(tokenAddress: string): Promise<void> {
        try {
            // Get all trades for this token - same pattern as PumpFun
            const trades = await this.prisma.monadTokenTrade.findMany({
                where: {
                    tokenAddress,
                    commitState: { in: ['finalized', 'verified'] } // Only count confirmed trades
                }
            });

            if (trades.length === 0) return;

            // Calculate statistics - same approach as PumpFun
            const totalTxCount = trades.length;
            const buyTrades = trades.filter(t => t.isBuy);
            const sellTrades = trades.filter(t => !t.isBuy);

            const totalWmonVolume = trades.reduce((sum, t) => sum + Number(t.wmonAmount), 0);
            const buyVolumeUsd = buyTrades.reduce((sum, t) => sum + Number(t.usdAmount), 0);
            const sellVolumeUsd = sellTrades.reduce((sum, t) => sum + Number(t.usdAmount), 0);
            const totalUsdVolume = buyVolumeUsd + sellVolumeUsd;

            const lastTradeTime = new Date(Math.max(...trades.map(t => t.timestamp.getTime())));

            // Count by commit state
            const proposedTrades = trades.filter(t => t.commitState === 'proposed').length;
            const finalizedTrades = trades.filter(t => t.commitState === 'finalized').length;
            const verifiedTrades = trades.filter(t => t.commitState === 'verified').length;

            // Upsert statistics - same pattern as PumpFun
            await this.prisma.monadTokenTradeStats.upsert({
                where: { tokenAddress },
                update: {
                    totalTxCount,
                    totalWmonVolume,
                    totalUsdVolume,
                    buyCount: buyTrades.length,
                    sellCount: sellTrades.length,
                    buyVolumeUsd,
                    sellVolumeUsd,
                    lastTradeTime,
                    proposedTrades,
                    finalizedTrades,
                    verifiedTrades,
                    updatedAt: new Date()
                },
                create: {
                    tokenAddress,
                    totalTxCount,
                    totalWmonVolume,
                    totalUsdVolume,
                    buyCount: buyTrades.length,
                    sellCount: sellTrades.length,
                    buyVolumeUsd,
                    sellVolumeUsd,
                    lastTradeTime,
                    proposedTrades,
                    finalizedTrades,
                    verifiedTrades
                }
            });

            console.log(`[📊 DB] Stats updated for ${tokenAddress}: ${totalTxCount} trades, ${totalUsdVolume.toFixed(2)} volume`);
        } catch (error) {
            console.error(`[❌ DB] Failed to update token stats ${tokenAddress}:`, error);
            throw error;
        }
    }

    async getTokenStats(tokenAddress: string): Promise<any> {
        try {
            return await this.prisma.monadTokenTradeStats.findUnique({
                where: { tokenAddress },
                include: { token: true }
            });
        } catch (error) {
            console.error(`[❌ DB] Failed to get token stats ${tokenAddress}:`, error);
            return null;
        }
    }

    // =============================================================================
    // CLEANUP OPERATIONS
    // =============================================================================

    async getTokensForArchival(): Promise<string[]> {
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const inactiveTokens = await this.prisma.monadTokenTradeStats.findMany({
                where: {
                    lastTradeTime: { lt: sevenDaysAgo }
                },
                select: { tokenAddress: true }
            });
            return inactiveTokens.map(t => t.tokenAddress);
        } catch (error) {
            console.error('[❌ DB] Failed to get tokens for archival:', error);
            return [];
        }
    }

    async getArchivedTokensForDeletion(): Promise<string[]> {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const oldArchivedTokens = await this.prisma.archivedMonadLaunchedToken.findMany({
                where: {
                    archivedAt: { lt: thirtyDaysAgo }
                },
                select: { token: true }
            });
            return oldArchivedTokens.map(t => t.token);
        } catch (error) {
            console.error('[❌ DB] Failed to get archived tokens for deletion:', error);
            return [];
        }
    }

    async archiveInactiveTokens(): Promise<number> {
        console.log('[🧹 CLEANUP] Archive functionality not implemented yet');
        return 0;
    }

    async deleteOldArchivedData(): Promise<number> {
        console.log('[🧹 CLEANUP] Delete functionality not implemented yet');
        return 0;
    }
}