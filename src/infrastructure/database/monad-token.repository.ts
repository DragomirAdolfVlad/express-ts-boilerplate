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
                    commitState: token.commitState as any,
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
                    commitState: token.commitState as any,
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
    // UTILITY METHODS
    // =============================================================================

    /**
     * Ensure token exists before writing trades (prevents FK violations)
     * Uses upsert for idempotency and speed
     */
    private async ensureTokenExists(params: {
        tokenAddress: string;
        creator?: string;
        bondingCurve?: string;
        blockNumber: string;
        blockId?: string;
        commitState: string;
        timestamp: Date;
        signature: string;
    }): Promise<void> {
        await this.prisma.monadLaunchedToken.upsert({
            where: { token: params.tokenAddress },
            create: {
                platform: 'monad',
                signature: params.signature,
                creator: params.creator || 'unknown',
                token: params.tokenAddress,
                bondingCurve: params.bondingCurve || 'unknown',
                blockNumber: params.blockNumber,
                blockId: params.blockId || 'unknown',
                commitState: params.commitState as any,
                timestamp: params.timestamp
            },
            update: {
                // Update commit state if it progresses (proposed -> finalized -> verified)
                commitState: params.commitState as any
            }
        });
    }

    /**
     * Ensure trade stats record exists (prevents FK violations)
     */
    private async ensureTradeStatsExists(tokenAddress: string, timestamp: Date): Promise<void> {
        await this.prisma.monadTokenTradeStats.upsert({
            where: { tokenAddress },
            create: {
                tokenAddress,
                totalTxCount: 0,
                buyCount: 0,
                sellCount: 0,
                totalWmonVolume: '0',
                totalUsdVolume: '0',
                lastTradeTime: timestamp
            },
            update: {
                lastTradeTime: timestamp
            }
        });
    }

    // =============================================================================
    // TRADE OPERATIONS
    // =============================================================================

    async saveTrade(trade: MonadTrade): Promise<void> {
        console.log(`[🚨 REPOSITORY] USING UPDATED REPOSITORY CODE - USD AMOUNT: ${trade.usdAmount}`);
        try {
            // ALWAYS ensure token exists before writing trade (upsert is idempotent and fast)
            await this.ensureTokenExists({
                tokenAddress: trade.tokenAddress,
                creator: trade.creator || 'unknown',
                bondingCurve: process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701', // Real NAD.FUN bonding curve
                blockNumber: trade.blockNumber,
                blockId: trade.blockId || 'unknown',
                commitState: trade.commitState,
                timestamp: trade.timestamp,
                signature: trade.transactionHash
            });

            // Ensure trade stats record exists
            await this.ensureTradeStatsExists(trade.tokenAddress, trade.timestamp);

            // Replace your 9-dec conversions with 18
            const wmonAmount = this.bigIntToNumber(trade.wmonAmount, 18);     // WMON
            const tokenAmount = this.bigIntToNumber(trade.tokenAmount, 18);    // TOKEN
            const pricePerTokenWmon = this.bigIntToNumber(trade.pricePerToken, 18);  // WMON per token

            // usdAmount already computed in the processor from WMON * price
            const usdAmount = trade.usdAmount ?? 0;

            // Spot price: USD per 1 token (guard divide-by-zero)
            const usdSpotPrice = tokenAmount > 0 ? (usdAmount / tokenAmount) : 0;

            // Simple market cap and liquidity - keep sane, avoid arbitrary caps
            const marketCap = usdAmount * 1000; // Simple multiplier for now
            const liquidityUsd = marketCap * 0.1; // 10% of market cap
            console.log(`[🔍 CORRECTED] wmonAmount: ${wmonAmount}, tokenAmount: ${tokenAmount}`);
            console.log(`[🔍 CORRECTED] usdAmount: ${usdAmount}, usdSpotPrice: ${usdSpotPrice}`);

            const curveProgress = this.calculateCurveProgress(trade.reserves);

            // Debug logging for all values being inserted
            console.log(`[🔍 DB] FINAL VALUES:`, {
                'wmonAmount': wmonAmount,
                'tokenAmount': tokenAmount,
                'pricePerTokenWmon': pricePerTokenWmon,
                'usdAmount': usdAmount,
                'usdSpotPrice': usdSpotPrice,
                'marketCap': marketCap,
                'liquidityUsd': liquidityUsd,
                'curveProgress': curveProgress
            });

            // Create unique trade ID for idempotency
            const logIndex = trade.logIndex || 0;
            const uniqueTradeId = `${trade.transactionHash}:${logIndex}`;

            // Check if trade already exists (for idempotency)
            const existingTrade = await this.prisma.monadTokenTrade.findFirst({
                where: { uniqueTradeId }
            });

            try {
                if (existingTrade) {
                    // Update existing trade
                    await this.prisma.monadTokenTrade.update({
                        where: { id: existingTrade.id },
                        data: {
                            // On reorg/commit-state changes, update these fields
                            commitState: trade.commitState as any,
                            blockNumber: trade.blockNumber,
                            blockId: trade.blockId || 'unknown',
                            usdSpotPrice: usdSpotPrice,
                            curveProgress: curveProgress,
                            marketCap: marketCap,
                            liquidityUsd: liquidityUsd,
                            virtualWmonReserve: this.bigIntToNumber(trade.reserves.reserve4, 18),
                            virtualTokenReserve: this.bigIntToNumber(trade.reserves.reserve3, 18)
                        }
                    });
                } else {
                    // Create new trade
                    await this.prisma.monadTokenTrade.create({
                        data: {
                        tokenAddress: trade.tokenAddress,
                        signature: trade.transactionHash,
                        logIndex,
                        uniqueTradeId,
                        blockNumber: trade.blockNumber,
                        blockId: trade.blockId || 'unknown',
                        commitState: trade.commitState as any,
                        trader: trade.trader,
                        isBuy: trade.isBuy,
                        
                        // Trade amounts (human readable)
                        wmonAmount: wmonAmount,
                        tokenAmount: tokenAmount,
                        pricePerToken: pricePerTokenWmon,
                        usdAmount: usdAmount,
                        
                        // Side-agnostic amounts
                        amountIn: trade.isBuy ? wmonAmount : tokenAmount,
                        amountOut: trade.isBuy ? tokenAmount : wmonAmount,
                        inAsset: trade.isBuy ? 'WMON' : 'TOKEN',
                        
                        // Event metadata
                        eventSignature: trade.eventSignature || null,
                        
                        // Trading context
                        source: 'curve',
                        isCreatorTrade: false, // TODO: Determine from creator data
                        timestamp: trade.timestamp,
                        
                        // Market data
                        curveProgress: curveProgress,
                        marketCap: marketCap,
                        liquidityUsd: liquidityUsd,
                        
                        // Raw amounts for debugging
                        amountWmonRaw: wmonAmount,
                        amountTokenRaw: tokenAmount,
                        
                        // Virtual reserves (constants for bonding curve)
                        virtualWmonReserve: this.bigIntToNumber(trade.reserves.reserve4, 18), // Virtual WMON
                        virtualTokenReserve: this.bigIntToNumber(trade.reserves.reserve3, 18), // Virtual token
                        
                        usdSpotPrice: usdSpotPrice
                        }
                    });
                }
            } catch (dbError) {
                console.error(`[❌ DB] Database insertion failed with values:`, {
                    wmonAmount,
                    tokenAmount,
                    pricePerTokenWmon,
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
                wmonAmount: this.bigIntToNumber(trade.wmonAmount, 18),
                tokenAmount: this.bigIntToNumber(trade.tokenAmount, 18)
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
                wmonAmount: this.numberToBigInt(Number(dbTrade.wmonAmount), 18),
                tokenAmount: this.numberToBigInt(Number(dbTrade.tokenAmount), 18),
                pricePerToken: this.numberToBigInt(Number(dbTrade.pricePerToken), 18),
                reserves: {
                    reserve1: BigInt(0), // Real WMON reserve - not stored in current schema
                    reserve2: BigInt(0), // Real token reserve - not stored in current schema
                    reserve3: this.numberToBigInt(Number(dbTrade.virtualWmonReserve || 0), 18),
                    reserve4: this.numberToBigInt(Number(dbTrade.virtualTokenReserve || 0), 18)
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
        // nad.fun bonding curve progress calculation
        // Structure: (realMonReserve, realTokenReserve, virtualMonReserve, virtualTokenReserve)
        try {
            const realTokenReserve = this.bigIntToNumber(reserves.reserve2, 18);
            const virtualTokenReserve = this.bigIntToNumber(reserves.reserve4, 18);

            // Progress is based on how much of the virtual token supply has been sold
            // Migration happens when 80% of 1B tokens are sold (800M tokens)
            const tokensSold = realTokenReserve; // Real tokens sold from the curve
            const migrationThreshold = virtualTokenReserve * 0.8; // 80% of 1B supply

            if (virtualTokenReserve === 0) return 0;

            const progress = Math.min(tokensSold / migrationThreshold, 1.0);
            return Math.round(progress * 10000) / 100; // Return as percentage with 2 decimal places
        } catch (error) {
            console.warn('[⚠️ DB] Failed to calculate nad.fun curve progress, using fallback:', error);

            // Fallback: simple calculation based on real vs virtual reserves
            try {
                const realReserves = this.bigIntToNumber(reserves.reserve1, 18) + this.bigIntToNumber(reserves.reserve2, 18);
                const virtualReserves = this.bigIntToNumber(reserves.reserve3, 18) + this.bigIntToNumber(reserves.reserve4, 18);
                const totalReserves = realReserves + virtualReserves;

                if (totalReserves === 0) return 0;
                const progress = Math.min(realReserves / totalReserves, 1.0);
                return Math.round(progress * 10000) / 100;
            } catch (fallbackError) {
                console.warn('[⚠️ DB] Fallback calculation also failed, using 0');
                return 0;
            }
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
                wmonAmount: this.numberToBigInt(Number(dbTrade.wmonAmount), 18),
                tokenAmount: this.numberToBigInt(Number(dbTrade.tokenAmount), 18),
                pricePerToken: this.numberToBigInt(Number(dbTrade.pricePerToken), 18),
                reserves: {
                    reserve1: BigInt(0), // Real WMON reserve - not stored in current schema
                    reserve2: BigInt(0), // Real token reserve - not stored in current schema
                    reserve3: this.numberToBigInt(Number(dbTrade.virtualWmonReserve || 0), 18),
                    reserve4: this.numberToBigInt(Number(dbTrade.virtualTokenReserve || 0), 18)
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