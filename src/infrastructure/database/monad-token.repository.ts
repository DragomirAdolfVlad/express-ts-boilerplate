/**
 * Monad Token Repository
 * 
 * PostgreSQL implementation for Monad token and trade persistence.
 * Includes auto-cleaning logic for data lifecycle management.
 */

import { PrismaClient, MonadTokenTrade, MonadTokenTradeStats } from '@prisma/client';
import { MonadToken, MonadTrade } from '../../domain/entities/monad-token.entity';

export interface MonadTokenRepository {
    // Token operations
    saveToken(token: MonadToken): Promise<void>;
    findTokenByAddress(address: string): Promise<MonadToken | null>;
    updateTokenMetadata(address: string, metadata: { name?: string; symbol?: string; description?: string; image?: string }): Promise<void>;

    // Trade operations
    saveTrade(trade: MonadTrade): Promise<void>;
    findTradesByToken(tokenAddress: string, limit?: number): Promise<MonadTrade[]>;
    findTradesByTrader(traderAddress: string, limit?: number): Promise<MonadTrade[]>;

    // Statistics operations
    updateTokenStats(tokenAddress: string): Promise<void>;
    getTokenStats(tokenAddress: string): Promise<MonadTokenTradeStats | null>;

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

            console.log(`[💾 DB] Token saved: ${token.address}`);
        } catch (error) {
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
        metadata: { name?: string; symbol?: string; description?: string; image?: string }
    ): Promise<void> {
        try {
            // First update the token record
            await this.prisma.monadLaunchedToken.update({
                where: { token: address },
                data: {
                    name: metadata.name,
                    symbol: metadata.symbol,
                    updatedAt: new Date()
                }
            });

            // Then create or update metadata record
            const token = await this.prisma.monadLaunchedToken.findUnique({
                where: { token: address }
            });

            if (token && (metadata.description || metadata.image)) {
                await this.prisma.monadTokenMetadata.upsert({
                    where: { id: token.metadataId || -1 },
                    update: {
                        name: metadata.name || '',
                        symbol: metadata.symbol || '',
                        description: metadata.description,
                        image: metadata.image,
                        updatedAt: new Date()
                    },
                    create: {
                        name: metadata.name || '',
                        symbol: metadata.symbol || '',
                        description: metadata.description,
                        image: metadata.image
                    }
                });
            }

            console.log(`[💾 DB] Token metadata updated: ${address}`);
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
            // Convert BigInt to Decimal for Prisma
            const wmonAmountDecimal = Number(trade.wmonAmount) / 1e9; // Convert from wei to WMON
            const tokenAmountDecimal = Number(trade.tokenAmount) / 1e9; // Convert from wei to tokens
            const pricePerTokenDecimal = Number(trade.pricePerToken) / 1e9; // Convert from wei

            // Save the trade
            await this.prisma.monadTokenTrade.create({
                data: {
                    tokenAddress: trade.tokenAddress,
                    signature: trade.transactionHash,
                    blockNumber: trade.blockNumber.toString(),
                    blockId: trade.blockId,
                    commitState: trade.commitState,
                    trader: trade.trader,
                    isBuy: trade.isBuy,
                    wmonAmount: wmonAmountDecimal,
                    tokenAmount: tokenAmountDecimal,
                    pricePerToken: pricePerTokenDecimal,
                    usdAmount: 0, // Will be calculated later with price feed
                    timestamp: trade.timestamp,
                    reserve1: trade.reserves.reserve1.toString(),
                    reserve2: trade.reserves.reserve2.toString(),
                    reserve3: trade.reserves.reserve3.toString(),
                    reserve4: trade.reserves.reserve4.toString()
                }
            });

            // Update token statistics
            await this.updateTokenStats(trade.tokenAddress);

            console.log(`[💾 DB] Trade saved: ${trade.tokenAddress} ${trade.isBuy ? 'BUY' : 'SELL'}`);
        } catch (error) {
            console.error(`[❌ DB] Failed to save trade:`, error);
            throw error;
        }
    }

    async findTradesByToken(tokenAddress: string, limit: number = 100): Promise<MonadTrade[]> {
        try {
            const dbTrades = await this.prisma.monadTokenTrade.findMany({
                where: { tokenAddress },
                orderBy: { timestamp: 'desc' },
                take: limit
            });

            return dbTrades.map((dbTrade: MonadTokenTrade) => new MonadTrade({
                tokenAddress: dbTrade.tokenAddress,
                trader: dbTrade.trader,
                isBuy: dbTrade.isBuy,
                wmonAmount: BigInt(Math.floor(Number(dbTrade.wmonAmount) * 1e9)), // Convert back to wei
                tokenAmount: BigInt(Math.floor(Number(dbTrade.tokenAmount) * 1e9)), // Convert back to wei
                pricePerToken: BigInt(Math.floor(Number(dbTrade.pricePerToken) * 1e9)), // Convert back to wei
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

    async findTradesByTrader(traderAddress: string, limit: number = 100): Promise<MonadTrade[]> {
        try {
            const dbTrades = await this.prisma.monadTokenTrade.findMany({
                where: { trader: traderAddress },
                orderBy: { timestamp: 'desc' },
                take: limit
            });

            return dbTrades.map((dbTrade: MonadTokenTrade) => new MonadTrade({
                tokenAddress: dbTrade.tokenAddress,
                trader: dbTrade.trader,
                isBuy: dbTrade.isBuy,
                wmonAmount: BigInt(Math.floor(Number(dbTrade.wmonAmount) * 1e9)), // Convert back to wei
                tokenAmount: BigInt(Math.floor(Number(dbTrade.tokenAmount) * 1e9)), // Convert back to wei
                pricePerToken: BigInt(Math.floor(Number(dbTrade.pricePerToken) * 1e9)), // Convert back to wei
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
            // Get all trades for this token
            const trades = await this.prisma.monadTokenTrade.findMany({
                where: {
                    tokenAddress,
                    commitState: { in: ['finalized', 'verified'] } // Only count confirmed trades
                }
            });

            if (trades.length === 0) return;

            // Calculate statistics
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

            // Upsert statistics
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

            console.log(`[📊 DB] Stats updated for ${tokenAddress}: ${totalTxCount} trades, $${totalUsdVolume.toFixed(2)} volume`);
        } catch (error) {
            console.error(`[❌ DB] Failed to update token stats ${tokenAddress}:`, error);
            throw error;
        }
    }

    async getTokenStats(tokenAddress: string): Promise<MonadTokenTradeStats | null> {
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
            // Find tokens with no trades in the last 7 days
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const inactiveTokens = await this.prisma.monadTokenTradeStats.findMany({
                where: {
                    lastTradeTime: { lt: sevenDaysAgo }
                },
                select: { tokenAddress: true }
            });

            return inactiveTokens.map((t: { tokenAddress: string }) => t.tokenAddress);
        } catch (error) {
            console.error('[❌ DB] Failed to get tokens for archival:', error);
            return [];
        }
    }

    async getArchivedTokensForDeletion(): Promise<string[]> {
        try {
            // Find archived tokens older than 30 days
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const oldArchivedTokens = await this.prisma.archivedMonadLaunchedToken.findMany({
                where: {
                    archivedAt: { lt: thirtyDaysAgo }
                },
                select: { token: true }
            });

            return oldArchivedTokens.map((t: { token: string }) => t.token);
        } catch (error) {
            console.error('[❌ DB] Failed to get archived tokens for deletion:', error);
            return [];
        }
    }

    async archiveInactiveTokens(): Promise<number> {
        try {
            const tokensToArchive = await this.getTokensForArchival();

            if (tokensToArchive.length === 0) {
                console.log('[🧹 CLEANUP] No tokens to archive');
                return 0;
            }

            let archivedCount = 0;

            for (const tokenAddress of tokensToArchive) {
                try {
                    let tradesCount = 0;

                    await this.prisma.$transaction(async (tx) => {
                        // Get token data
                        const token = await tx.monadLaunchedToken.findUnique({
                            where: { token: tokenAddress },
                            include: {
                                metadata: true,
                                tokenStats: true,
                                trades: true
                            }
                        });

                        if (!token) return;

                        tradesCount = token.trades?.length || 0;

                        // Archive the token
                        await tx.archivedMonadLaunchedToken.create({
                            data: {
                                platform: token.platform,
                                signature: token.signature,
                                creator: token.creator,
                                token: token.token,
                                bondingCurve: token.bondingCurve,
                                blockNumber: token.blockNumber,
                                blockId: token.blockId,
                                timestamp: token.timestamp,
                                name: token.name,
                                symbol: token.symbol,
                                metadataSnapshot: token.metadata ? {
                                    name: token.metadata.name,
                                    symbol: token.metadata.symbol,
                                    description: token.metadata.description,
                                    image: token.metadata.image
                                } : undefined,
                                archiveReason: 'No trades for 7 days',
                                lastActivityAt: token.tokenStats?.lastTradeTime,
                                finalMarketCap: token.tokenStats?.totalUsdVolume,
                                totalVolumeUsd: token.tokenStats?.totalUsdVolume,
                                totalTrades: token.tokenStats?.totalTxCount,
                                originalCreatedAt: token.createdAt,
                                originalUpdatedAt: token.updatedAt
                            }
                        });

                        // Archive all trades
                        for (const trade of token.trades) {
                            await tx.archivedMonadTokenTrade.create({
                                data: {
                                    tokenAddress: trade.tokenAddress,
                                    signature: trade.signature,
                                    blockNumber: trade.blockNumber,
                                    blockId: trade.blockId,
                                    commitState: trade.commitState,
                                    trader: trade.trader,
                                    isBuy: trade.isBuy,
                                    wmonAmount: trade.wmonAmount,
                                    tokenAmount: trade.tokenAmount,
                                    pricePerToken: trade.pricePerToken,
                                    usdAmount: trade.usdAmount,
                                    isCreatorTrade: trade.isCreatorTrade,
                                    timestamp: trade.timestamp,
                                    curveProgress: trade.curveProgress,
                                    marketCap: trade.marketCap,
                                    reserve1: trade.reserve1,
                                    reserve2: trade.reserve2,
                                    reserve3: trade.reserve3,
                                    reserve4: trade.reserve4,
                                    usdSpotPrice: trade.usdSpotPrice
                                }
                            });
                        }

                        // Delete original records
                        await tx.monadTokenTrade.deleteMany({ where: { tokenAddress } });
                        await tx.monadTokenTradeStats.delete({ where: { tokenAddress } });
                        if (token.metadata) {
                            await tx.monadTokenMetadata.delete({ where: { id: token.metadataId! } });
                        }
                        await tx.monadLaunchedToken.delete({ where: { token: tokenAddress } });
                    });

                    archivedCount++;
                    console.log(`[📦 ARCHIVED] Token ${tokenAddress} and ${tradesCount} trades`);
                } catch (error) {
                    console.error(`[❌ ARCHIVE] Failed to archive token ${tokenAddress}:`, error);
                }
            }

            console.log(`[🧹 CLEANUP] Archived ${archivedCount} inactive tokens`);
            return archivedCount;
        } catch (error) {
            console.error('[❌ DB] Failed to archive inactive tokens:', error);
            return 0;
        }
    }

    async deleteOldArchivedData(): Promise<number> {
        try {
            const tokensToDelete = await this.getArchivedTokensForDeletion();

            if (tokensToDelete.length === 0) {
                console.log('[🧹 CLEANUP] No archived data to delete');
                return 0;
            }

            let deletedCount = 0;

            for (const tokenAddress of tokensToDelete) {
                try {
                    await this.prisma.$transaction(async (tx) => {
                        // Delete archived trades
                        const deletedTrades = await tx.archivedMonadTokenTrade.deleteMany({
                            where: { tokenAddress }
                        });

                        // Delete archived token
                        await tx.archivedMonadLaunchedToken.delete({
                            where: { token: tokenAddress }
                        });

                        console.log(`[🗑️ DELETED] Archived token ${tokenAddress} and ${deletedTrades.count} trades`);
                        deletedCount++;
                    });
                } catch (error) {
                    console.error(`[❌ DELETE] Failed to delete archived token ${tokenAddress}:`, error);
                }
            }

            console.log(`[🧹 CLEANUP] Deleted ${deletedCount} old archived tokens`);
            return deletedCount;
        } catch (error) {
            console.error('[❌ DB] Failed to delete old archived data:', error);
            return 0;
        }
    }
}