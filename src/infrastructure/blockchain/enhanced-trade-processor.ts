/**
 * Enhanced Trade Processor
 * 
 * Processes trades with enhanced data including reserves, pricing, and market metrics
 * Optimized for high performance with caching and batch operations
 */

import { JsonRpcProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { OptimizedTokenCreationTracker } from './optimized-tracker';
import { redisTrackerCache } from '../../services/redis/tracker-cache.service';

interface EnhancedTradeData {
    tokenAddress: string;
    trader: string;
    isBuy: boolean;
    wmonAmount: bigint;
    tokenAmount: bigint;
    pricePerToken: bigint;
    reserves: { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint };
    blockNumber: string;
    blockHash: string;
    blockTimestamp: Date;
    transactionHash: string;
    logIndex: number;
    commitState: string;
}

export class EnhancedTradeProcessor {
    private blockCache = new Map<string, { hash: string; timestamp: Date }>();
    private reserveCache = new Map<string, { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint }>();
    private tokenCreationTracker: OptimizedTokenCreationTracker;
    private cacheCleanupTimer?: NodeJS.Timeout;
    private readonly MAX_CACHE_SIZE = 1000; // Limit cache size

    constructor(
        provider: JsonRpcProvider,
        private prisma: PrismaClient
    ) {
        this.tokenCreationTracker = new OptimizedTokenCreationTracker(provider, prisma);
        this.startCacheCleanup();
    }

    /**
     * Start periodic cache cleanup to prevent memory leaks
     */
    private startCacheCleanup(): void {
        this.cacheCleanupTimer = setInterval(() => {
            this.clearCaches();
        }, 300000); // Every 5 minutes
    }

    /**
     * Process trade with enhanced data including reserves and market metrics
     */
    async processTradeWithEnhancedData(
        signature: string,
        logIndex: number,
        tokenAddress: string,
        trader: string,
        isBuy: boolean,
        wmonAmount: bigint,
        tokenAmount: bigint,
        pricePerToken: bigint,
        reserves: { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint },
        commitState: string,
        realBlockNumber?: string,
        realBlockHash?: string,
        realTimestamp?: Date
    ): Promise<void> {
        try {
            // 1. Use real block data when available, fallback to approximate
            let blockData;
            if (realBlockNumber && realBlockHash) {
                // Use real blockchain data
                const blockNum = parseInt(realBlockNumber, 16);
                const blockTimestamp = realTimestamp || new Date(); // Use provided timestamp or current time
                
                blockData = {
                    blockNumber: blockNum.toString(),
                    blockHash: realBlockHash,
                    timestamp: blockTimestamp
                };
            } else {
                // Fallback to approximate data (avoid RPC calls)
                const currentBlock = Math.floor(Date.now() / 1000 / 12);
                blockData = {
                    blockNumber: currentBlock.toString(),
                    blockHash: 'optimized',
                    timestamp: new Date()
                };
            }

            // 2. Skip reserve extraction to avoid RPC spam
            const enhancedReserves = reserves; // Use provided reserves

            // 3. Create enhanced trade data
            const enhancedTrade: EnhancedTradeData = {
                tokenAddress,
                trader,
                isBuy,
                wmonAmount,
                tokenAmount,
                pricePerToken,
                reserves: enhancedReserves,
                blockNumber: blockData.blockNumber,
                blockHash: blockData.blockHash,
                blockTimestamp: blockData.timestamp,
                transactionHash: signature,
                logIndex,
                commitState
            };

            // 4. Check for new token creation (first trade detection)
            await this.tokenCreationTracker.detectTokenFromFirstTrade(
                tokenAddress,
                signature,
                logIndex,
                trader,
                blockData.blockNumber,
                blockData.blockHash,
                blockData.timestamp
            );

            // 5. Write enhanced trade data
            await this.writeEnhancedTrade(enhancedTrade);

            // 6. Invalidate cache for this token (Task 8.4)
            try {
                await redisTrackerCache.invalidateTokenWithStats(tokenAddress);
                await redisTrackerCache.invalidateRankings(tokenAddress);
                console.log(`[🗑️  CACHE] Invalidated cache for token: ${tokenAddress}`);
            } catch (cacheError) {
                console.warn('[⚠️  CACHE] Failed to invalidate cache:', cacheError);
                // Don't throw - cache invalidation failures should not break trade processing
            }

            console.log(`[⚡ ENHANCED] Trade processed: ${tokenAddress} ${isBuy ? 'BUY' : 'SELL'} - Block: ${blockData.blockHash.slice(0, 10)}...`);

        } catch (error) {
            console.error(`[❌ ENHANCED] Failed to process trade ${signature}:${logIndex}:`, error);
            throw error;
        }
    }

    /**
     * Get enhanced block data - simplified to avoid RPC spam
     */
    // Method removed - using inline block data to avoid RPC spam

    /**
     * Write enhanced trade data to database
     */
    private async writeEnhancedTrade(trade: EnhancedTradeData): Promise<void> {
        const startTime = Date.now();
        const uniqueTradeId = `${trade.transactionHash}:${trade.logIndex}`;

        // Calculate USD amounts and market metrics
        const wmonAmount = this.bigIntToNumber(trade.wmonAmount, 18);
        const tokenAmount = this.bigIntToNumber(trade.tokenAmount, 18);
        const pricePerToken = this.bigIntToNumber(trade.pricePerToken, 18);
        
        // Mock WMON price (would get from price service in production)
        const wmonPriceUsd = 3.25;
        const usdAmount = wmonAmount * wmonPriceUsd;
        const usdSpotPrice = tokenAmount > 0 ? usdAmount / tokenAmount : 0;
        const marketCap = usdAmount * 1000; // Simplified calculation
        const liquidityUsd = marketCap * 0.1;
        const curveProgress = this.calculateCurveProgress(trade.reserves);

        try {
            if (!trade.isBuy) {
                console.log(`[💾 DB] SAVING SELL TRADE: ${uniqueTradeId}`);
            }
            
            // Check if trade already exists (for idempotency)
            const existingTrade = await this.prisma.monadTokenTrade.findFirst({
                where: { uniqueTradeId }
            });
            
            if (existingTrade) {
                // Update existing trade
                await this.prisma.monadTokenTrade.update({
                    where: { id: existingTrade.id },
                    data: {
                        commitState: trade.commitState as any,
                        blockNumber: trade.blockNumber,
                        blockId: trade.blockHash,
                        timestamp: trade.blockTimestamp,
                        virtualWmonReserve: this.bigIntToNumber(trade.reserves.reserve3, 18),
                        virtualTokenReserve: this.bigIntToNumber(trade.reserves.reserve4, 18),
                        curveProgress,
                        marketCap,
                        liquidityUsd,
                        usdSpotPrice
                    }
                });
            } else {
                // Create new trade
                await this.prisma.monadTokenTrade.create({
                    data: {
                    tokenAddress: trade.tokenAddress,
                    signature: trade.transactionHash,
                    logIndex: trade.logIndex,
                    uniqueTradeId,
                    blockNumber: trade.blockNumber,
                    blockId: trade.blockHash,
                    commitState: trade.commitState as any,
                    trader: trade.trader,
                    isBuy: trade.isBuy,
                    wmonAmount,
                    tokenAmount,
                    pricePerToken,
                    usdAmount,
                    amountIn: trade.isBuy ? wmonAmount : tokenAmount,
                    amountOut: trade.isBuy ? tokenAmount : wmonAmount,
                    inAsset: trade.isBuy ? 'WMON' : 'TOKEN',
                    eventSignature: 'unknown',
                    source: 'curve',
                    isCreatorTrade: false,
                    timestamp: trade.blockTimestamp,
                    curveProgress,
                    marketCap,
                    liquidityUsd,
                    amountWmonRaw: wmonAmount,
                    amountTokenRaw: tokenAmount,
                    virtualWmonReserve: this.bigIntToNumber(trade.reserves.reserve3, 18),
                    virtualTokenReserve: this.bigIntToNumber(trade.reserves.reserve4, 18),
                    usdSpotPrice
                    }
                });
            }

            const dbLatency = Date.now() - startTime;
            if (dbLatency > 100) {
                console.log(`[⚠️  DB] Slow trade upsert: ${dbLatency}ms for ${uniqueTradeId}`);
            }

        } catch (error) {
            const dbLatency = Date.now() - startTime;
            console.error(`[❌ ENHANCED] Database write failed after ${dbLatency}ms:`, error);
            throw error;
        }
    }

    /**
     * Convert BigInt to number with proper decimal handling
     */
    private bigIntToNumber(value: bigint, decimals: number = 18): number {
        const divisor = BigInt(10 ** decimals);
        const integerPart = Number(value / divisor);
        const decimalPart = Number(value % divisor) / Number(divisor);
        return integerPart + decimalPart;
    }

    /**
     * Calculate bonding curve progress (0-100%)
     */
    private calculateCurveProgress(reserves: { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint }): number {
        // Simplified curve progress calculation
        const totalVirtualToken = Number(reserves.reserve4);
        
        if (totalVirtualToken === 0) return 0;
        
        // Progress based on how much of the virtual token supply has been bought
        const progress = Math.min(100, (1000000000 - totalVirtualToken) / 1000000000 * 100);
        return Math.max(0, progress);
    }

    /**
     * Clear caches periodically to prevent memory leaks
     */
    clearCaches(): void {
        const blockCacheSize = this.blockCache.size;
        const reserveCacheSize = this.reserveCache.size;
        
        // Enforce size limits before clearing
        if (blockCacheSize > this.MAX_CACHE_SIZE) {
            const entriesToRemove = blockCacheSize - this.MAX_CACHE_SIZE;
            const keys = Array.from(this.blockCache.keys());
            for (let i = 0; i < entriesToRemove; i++) {
                const key = keys[i];
                if (key) {
                    this.blockCache.delete(key);
                }
            }
            console.log(`[🧹 CACHE] Trimmed blockCache: ${blockCacheSize} → ${this.blockCache.size}`);
        }

        if (reserveCacheSize > this.MAX_CACHE_SIZE) {
            const entriesToRemove = reserveCacheSize - this.MAX_CACHE_SIZE;
            const keys = Array.from(this.reserveCache.keys());
            for (let i = 0; i < entriesToRemove; i++) {
                const key = keys[i];
                if (key) {
                    this.reserveCache.delete(key);
                }
            }
            console.log(`[🧹 CACHE] Trimmed reserveCache: ${reserveCacheSize} → ${this.reserveCache.size}`);
        }
        
        // Full clear every 5 minutes
        this.blockCache.clear();
        this.reserveCache.clear();
        
        if (blockCacheSize > 0 || reserveCacheSize > 0) {
            console.log(`[🧹 CACHE] Cleared EnhancedTradeProcessor caches: blocks=${blockCacheSize}, reserves=${reserveCacheSize}`);
        }
    }

    /**
     * Cleanup on shutdown
     */
    destroy(): void {
        if (this.cacheCleanupTimer) {
            clearInterval(this.cacheCleanupTimer);
        }
        this.clearCaches();
    }
}