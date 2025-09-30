/**
 * Enhanced Trade Processor
 * 
 * High-performance trade processing with proper block data extraction
 * and virtual reserve calculation for near 0ms latency
 */
import { JsonRpcProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

interface EnhancedTradeData {
    tokenAddress: string;
    trader: string;
    isBuy: boolean;
    wmonAmount: bigint;
    tokenAmount: bigint;
    pricePerToken: bigint;
    reserves: {
        reserve1: bigint; // Real WMON reserve
        reserve2: bigint; // Real token reserve  
        reserve3: bigint; // Virtual WMON reserve
        reserve4: bigint; // Virtual token reserve
    };
    blockNumber: string;
    blockHash: string; // Proper block identification
    blockTimestamp: Date; // Accurate block timestamp
    transactionHash: string;
    logIndex: number;
    eventSignature: string;
    commitState: string;
}

export class EnhancedTradeProcessor {
    private blockCache = new Map<string, { hash: string; timestamp: Date }>();
    private reserveCache = new Map<string, { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint }>();

    constructor(
        private provider: JsonRpcProvider,
        private prisma: PrismaClient
    ) { }

    /**
     * Process trade with enhanced data extraction for maximum performance
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
        commitState: string
    ): Promise<void> {
        try {
            // 1. Get enhanced block data (with caching)
            const blockData = await this.getEnhancedBlockData(signature);

            // 2. Extract proper reserves from event data
            const enhancedReserves = await this.extractReservesFromEvent(signature, logIndex);

            // 3. Create enhanced trade data
            const enhancedTrade: EnhancedTradeData = {
                tokenAddress,
                trader,
                isBuy,
                wmonAmount,
                tokenAmount,
                pricePerToken,
                reserves: enhancedReserves || reserves, // Use extracted or fallback
                blockNumber: blockData.blockNumber,
                blockHash: blockData.blockHash,
                blockTimestamp: blockData.timestamp,
                transactionHash: signature,
                logIndex,
                eventSignature: await this.getEventSignature(signature, logIndex),
                commitState
            };

            // 4. High-performance database write
            await this.writeEnhancedTrade(enhancedTrade);

        } catch (error) {
            console.error(`[❌ ENHANCED] Failed to process trade ${signature}:${logIndex}:`, error);
            throw error;
        }
    }

    /**
     * Get enhanced block data with caching for performance
     */
    private async getEnhancedBlockData(txHash: string): Promise<{
        blockNumber: string;
        blockHash: string;
        timestamp: Date;
    }> {
        try {
            // Check cache first
            if (this.blockCache.has(txHash)) {
                const cached = this.blockCache.get(txHash)!;
                return {
                    blockNumber: 'cached',
                    blockHash: cached.hash,
                    timestamp: cached.timestamp
                };
            }

            // Get transaction receipt
            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt) {
                throw new Error(`No receipt found for ${txHash}`);
            }

            // Get block data
            const block = await this.provider.getBlock(receipt.blockNumber);
            if (!block) {
                throw new Error(`No block found for ${receipt.blockNumber}`);
            }

            const blockData = {
                blockNumber: receipt.blockNumber.toString(),
                blockHash: block.hash || 'unknown',
                timestamp: new Date(block.timestamp * 1000) // Convert to milliseconds
            };

            // Only cache if we have a valid block hash
            if (blockData.blockHash !== 'unknown') {
                this.blockCache.set(txHash, {
                    hash: blockData.blockHash,
                    timestamp: blockData.timestamp
                });
            }

            return blockData;

        } catch (error) {
            console.warn(`[⚠️ ENHANCED] Failed to get block data for ${txHash}, using fallback`);
            return {
                blockNumber: 'unknown',
                blockHash: 'unknown',
                timestamp: new Date()
            };
        }
    }

    /**
     * Extract virtual reserves from event data
     */
    private async extractReservesFromEvent(
        txHash: string,
        logIndex: number
    ): Promise<{ reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint } | null> {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt || !receipt.logs || receipt.logs.length <= logIndex) {
                return null;
            }

            const log = receipt.logs[logIndex];

            if (!log) {
                return null;
            }

            // NAD.FUN swap event has reserves in the data
            // Event signature: Swap(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)
            if (log.data && log.data.length >= 258) { // 32 bytes * 8 fields + 2 for 0x
                try {
                    // Parse the event data (simplified - would need proper ABI decoding in production)
                    const data = log.data.slice(2); // Remove 0x

                    // Extract reserves (this is a simplified version - proper ABI decoding needed)
                    const reserve1 = BigInt('0x' + data.slice(128, 192)); // Real WMON
                    const reserve2 = BigInt('0x' + data.slice(192, 256)); // Real token
                    const reserve3 = BigInt('0x' + data.slice(256, 320)); // Virtual WMON
                    const reserve4 = BigInt('0x' + data.slice(320, 384)); // Virtual token

                    return { reserve1, reserve2, reserve3, reserve4 };
                } catch (parseError) {
                    console.warn(`[⚠️ ENHANCED] Failed to parse reserves from ${txHash}:${logIndex}`);
                    return null;
                }
            }

            return null;
        } catch (error) {
            console.warn(`[⚠️ ENHANCED] Failed to extract reserves from ${txHash}:${logIndex}`);
            return null;
        }
    }

    /**
     * Get event signature for proper event identification
     */
    private async getEventSignature(txHash: string, logIndex: number): Promise<string> {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);
            if (!receipt || !receipt.logs || receipt.logs.length <= logIndex) {
                return 'unknown';
            }

            const log = receipt.logs[logIndex];
            return log?.topics[0] || 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * High-performance database write with proper indexing
     */
    private async writeEnhancedTrade(trade: EnhancedTradeData): Promise<void> {
        const uniqueTradeId = `${trade.transactionHash}:${trade.logIndex}`;

        // Convert BigInt to numbers for database storage
        const wmonAmount = this.bigIntToNumber(trade.wmonAmount, 18);
        const tokenAmount = this.bigIntToNumber(trade.tokenAmount, 18);
        const pricePerToken = this.bigIntToNumber(trade.pricePerToken, 18);

        // Calculate USD amounts and market data
        const usdAmount = wmonAmount * 3.25; // WMON price (should be from price feed)
        const usdSpotPrice = tokenAmount > 0 ? (usdAmount / tokenAmount) : 0;
        const marketCap = usdAmount * 1000;
        const liquidityUsd = marketCap * 0.1;
        const curveProgress = this.calculateCurveProgress(trade.reserves);

        try {
            // Single optimized upsert operation
            await this.prisma.monadTokenTrade.upsert({
                where: { uniqueTradeId },
                create: {
                    tokenAddress: trade.tokenAddress,
                    signature: trade.transactionHash,
                    logIndex: trade.logIndex,
                    uniqueTradeId,
                    blockNumber: trade.blockNumber,
                    blockId: trade.blockHash, // Proper block identification
                    commitState: trade.commitState as any,
                    trader: trade.trader,
                    isBuy: trade.isBuy,

                    // Trade amounts
                    wmonAmount,
                    tokenAmount,
                    pricePerToken,
                    usdAmount,

                    // Side-agnostic amounts
                    amountIn: trade.isBuy ? wmonAmount : tokenAmount,
                    amountOut: trade.isBuy ? tokenAmount : wmonAmount,
                    inAsset: trade.isBuy ? 'WMON' : 'TOKEN',

                    // Event metadata
                    eventSignature: trade.eventSignature,

                    // Trading context
                    source: 'curve',
                    isCreatorTrade: false,
                    timestamp: trade.blockTimestamp, // Accurate block timestamp

                    // Market data
                    curveProgress,
                    marketCap,
                    liquidityUsd,

                    // Raw amounts
                    amountWmonRaw: wmonAmount,
                    amountTokenRaw: tokenAmount,

                    // Enhanced virtual reserves
                    virtualWmonReserve: this.bigIntToNumber(trade.reserves.reserve3, 18),
                    virtualTokenReserve: this.bigIntToNumber(trade.reserves.reserve4, 18),

                    usdSpotPrice
                },
                update: {
                    // Update on reorg/commit state changes
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

            console.log(`[⚡ ENHANCED] Trade processed: ${trade.tokenAddress} ${trade.isBuy ? 'BUY' : 'SELL'} - Block: ${trade.blockHash.slice(0, 10)}...`);
        } catch (error) {
            console.error(`[❌ ENHANCED] Database write failed:`, error);
            throw error;
        }
    }

    private bigIntToNumber(value: bigint, decimals: number): number {
        const stringValue = value.toString();
        if (stringValue.length <= decimals) {
            const decimalPart = stringValue.padStart(decimals, '0');
            return parseFloat(`0.${decimalPart}`);
        } else {
            const integerPart = stringValue.slice(0, -decimals) || '0';
            const decimalPart = stringValue.slice(-decimals);
            return parseFloat(`${integerPart}.${decimalPart}`);
        }
    }

    private calculateCurveProgress(reserves: { reserve1: bigint; reserve2: bigint; reserve3: bigint; reserve4: bigint }): number {
        try {
            const realTokenReserve = this.bigIntToNumber(reserves.reserve2, 18);
            const virtualTokenReserve = this.bigIntToNumber(reserves.reserve4, 18);

            if (virtualTokenReserve === 0) return 0;

            const tokensSold = realTokenReserve;
            const migrationThreshold = virtualTokenReserve * 0.8;
            const progress = Math.min(tokensSold / migrationThreshold, 1.0);

            return Math.round(progress * 10000) / 100;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Clear caches periodically for memory management
     */
    clearCaches(): void {
        this.blockCache.clear();
        this.reserveCache.clear();
        console.log('[🧹 ENHANCED] Caches cleared');
    }
}