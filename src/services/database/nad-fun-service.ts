/**
 * nad.fun specific service for liquidity pools and trading data
 */

import { PrismaClient, NadFunPool, NadFunTrade, Token, TradeType, PoolStatus, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

export interface CreateNadFunPoolData {
    tokenId: string;
    poolAddress: string;
    reserveToken: string;
    reserveAmount: string;
    tokenAmount: string;
    price?: string;
    marketCap?: string;
}

export interface CreateNadFunTradeData {
    poolId: string;
    transactionId: string;
    trader: string;
    tradeType: TradeType;
    tokenAmount: string;
    ethAmount: string;
    price: string;
    slippage?: string;
    timestamp: Date;
}

export interface UpdatePoolData {
    reserveAmount?: string;
    tokenAmount?: string;
    price?: string;
    marketCap?: string;
    volume24h?: string;
    trades24h?: number;
    status?: PoolStatus;
}

export interface PoolWithStats extends NadFunPool {
    token: Token;
    totalTrades: number;
    totalVolume: string;
    priceChange24h: string;
    recentTrades: NadFunTrade[];
}

export interface TradingStats {
    totalVolume24h: string;
    totalTrades24h: number;
    uniqueTraders24h: number;
    avgTradeSize: string;
    topTraders: Array<{
        trader: string;
        volume: string;
        trades: number;
    }>;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
    orderBy?: 'createdAt' | 'volume24h' | 'marketCap' | 'price';
    orderDirection?: 'asc' | 'desc';
}

export class NadFunService extends HealthCheckableService {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        super('NadFunService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Create or update a nad.fun pool
     */
    async createOrUpdatePool(
        poolData: CreateNadFunPoolData,
        context: LogContext = {}
    ): Promise<NadFunPool> {
        const timer = this.startTimer('createOrUpdatePool');
        
        try {
            log.debug('Creating/updating nad.fun pool', {
                ...context,
                poolAddress: poolData.poolAddress,
                tokenId: poolData.tokenId
            });

            // Validate pool address format
            if (!this.isValidAddress(poolData.poolAddress)) {
                throw new ValidationError('Invalid pool address format', 'poolAddress');
            }

            // Verify token exists
            const token = await this.prisma.token.findUnique({
                where: { id: poolData.tokenId }
            });

            if (!token) {
                throw new NotFoundError('Token not found');
            }

            const pool = await this.prisma.nadFunPool.upsert({
                where: {
                    poolAddress: poolData.poolAddress
                },
                update: {
                    reserveAmount: poolData.reserveAmount,
                    tokenAmount: poolData.tokenAmount,
                    price: poolData.price || '0',
                    marketCap: poolData.marketCap || '0',
                    updatedAt: new Date()
                },
                create: {
                    ...poolData,
                    price: poolData.price || '0',
                    marketCap: poolData.marketCap || '0',
                    volume24h: '0',
                    trades24h: 0,
                    status: PoolStatus.ACTIVE
                },
                include: {
                    token: true
                }
            });

            const duration = timer.end();
            log.info('nad.fun pool created/updated successfully', {
                ...context,
                poolId: pool.id,
                poolAddress: pool.poolAddress,
                tokenSymbol: pool.token.symbol,
                duration: `${duration}ms`
            });

            return pool;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createOrUpdatePool', 'nad_fun_pools', context);
        }
    }

    /**
     * Create a nad.fun trade
     */
    async createTrade(
        tradeData: CreateNadFunTradeData,
        context: LogContext = {}
    ): Promise<NadFunTrade> {
        const timer = this.startTimer('createTrade');
        
        try {
            log.debug('Creating nad.fun trade', {
                ...context,
                poolId: tradeData.poolId,
                trader: tradeData.trader,
                tradeType: tradeData.tradeType,
                tokenAmount: tradeData.tokenAmount
            });

            const trade = await this.prisma.nadFunTrade.create({
                data: tradeData,
                include: {
                    pool: {
                        include: {
                            token: true
                        }
                    },
                    transaction: true
                }
            });

            // Update pool statistics
            await this.updatePoolStats(tradeData.poolId, tradeData.ethAmount, context);

            const duration = timer.end();
            log.info('nad.fun trade created successfully', {
                ...context,
                tradeId: trade.id,
                tokenSymbol: trade.pool.token.symbol,
                tradeType: trade.tradeType,
                volume: tradeData.ethAmount,
                duration: `${duration}ms`
            });

            return trade;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createTrade', 'nad_fun_trades', context);
        }
    }

    /**
     * Get pool by address with stats
     */
    async getPoolByAddress(
        poolAddress: string,
        context: LogContext = {}
    ): Promise<PoolWithStats | null> {
        const timer = this.startTimer('getPoolByAddress');
        
        try {
            const pool = await this.prisma.nadFunPool.findUnique({
                where: { poolAddress },
                include: {
                    token: true,
                    trades: {
                        take: 10,
                        orderBy: { timestamp: 'desc' },
                        include: {
                            transaction: true
                        }
                    },
                    _count: {
                        select: { trades: true }
                    }
                }
            });

            if (!pool) {
                return null;
            }

            // Calculate additional stats
            const [totalVolume, priceChange24h] = await Promise.all([
                this.calculatePoolVolume(pool.id),
                this.calculatePriceChange24h(pool.id)
            ]);

            const poolWithStats: PoolWithStats = {
                ...pool,
                totalTrades: pool._count.trades,
                totalVolume,
                priceChange24h,
                recentTrades: pool.trades
            };

            const duration = timer.end();
            log.debug('Pool retrieved with stats', {
                ...context,
                poolAddress,
                tokenSymbol: pool.token.symbol,
                totalTrades: poolWithStats.totalTrades,
                duration: `${duration}ms`
            });

            return poolWithStats;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getPoolByAddress', 'nad_fun_pools', context);
        }
    }

    /**
     * Get all pools with pagination and filtering
     */
    async getPools(
        options: PaginationOptions & {
            search?: string;
            status?: PoolStatus;
            minVolume?: string;
        } = {},
        context: LogContext = {}
    ): Promise<{ pools: PoolWithStats[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getPools');
        const { 
            page = 1, 
            limit = 20, 
            orderBy = 'createdAt', 
            orderDirection = 'desc',
            search,
            status,
            minVolume
        } = options;
        const skip = (page - 1) * limit;
        
        try {
            const where: Prisma.NadFunPoolWhereInput = {};

            if (search) {
                where.OR = [
                    { token: { name: { contains: search, mode: 'insensitive' } } },
                    { token: { symbol: { contains: search, mode: 'insensitive' } } },
                    { poolAddress: { contains: search, mode: 'insensitive' } }
                ];
            }

            if (status) {
                where.status = status;
            }

            if (minVolume) {
                where.volume24h = {
                    gte: minVolume
                };
            }

            const [pools, total] = await Promise.all([
                this.prisma.nadFunPool.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        [orderBy]: orderDirection
                    },
                    include: {
                        token: true,
                        trades: {
                            take: 5,
                            orderBy: { timestamp: 'desc' }
                        },
                        _count: {
                            select: { trades: true }
                        }
                    }
                }),
                this.prisma.nadFunPool.count({ where })
            ]);

            // Add stats to pools
            const poolsWithStats: PoolWithStats[] = await Promise.all(
                pools.map(async (pool) => {
                    const [totalVolume, priceChange24h] = await Promise.all([
                        this.calculatePoolVolume(pool.id),
                        this.calculatePriceChange24h(pool.id)
                    ]);

                    return {
                        ...pool,
                        totalTrades: pool._count.trades,
                        totalVolume,
                        priceChange24h,
                        recentTrades: pool.trades
                    };
                })
            );

            const hasMore = skip + pools.length < total;
            const duration = timer.end();

            log.debug('Pools retrieved', {
                ...context,
                page,
                limit,
                total,
                returned: pools.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { pools: poolsWithStats, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getPools', 'nad_fun_pools', context);
        }
    }

    /**
     * Get trades for a pool
     */
    async getPoolTrades(
        poolAddress: string,
        options: PaginationOptions & {
            tradeType?: TradeType;
            trader?: string;
            fromTimestamp?: Date;
            toTimestamp?: Date;
        } = {},
        context: LogContext = {}
    ): Promise<{ trades: NadFunTrade[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getPoolTrades');
        const { 
            page = 1, 
            limit = 20, 
            orderDirection = 'desc',
            tradeType,
            trader,
            fromTimestamp,
            toTimestamp
        } = options;
        const skip = (page - 1) * limit;
        
        try {
            const pool = await this.prisma.nadFunPool.findUnique({
                where: { poolAddress }
            });

            if (!pool) {
                throw new NotFoundError('Pool not found');
            }

            const where: Prisma.NadFunTradeWhereInput = {
                poolId: pool.id
            };

            if (tradeType) {
                where.tradeType = tradeType;
            }

            if (trader) {
                where.trader = trader;
            }

            if (fromTimestamp || toTimestamp) {
                where.timestamp = {};
                if (fromTimestamp) {
                    where.timestamp.gte = fromTimestamp;
                }
                if (toTimestamp) {
                    where.timestamp.lte = toTimestamp;
                }
            }

            const [trades, total] = await Promise.all([
                this.prisma.nadFunTrade.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { timestamp: orderDirection },
                    include: {
                        pool: {
                            include: {
                                token: true
                            }
                        },
                        transaction: {
                            include: {
                                block: true
                            }
                        }
                    }
                }),
                this.prisma.nadFunTrade.count({ where })
            ]);

            const hasMore = skip + trades.length < total;
            const duration = timer.end();

            log.debug('Pool trades retrieved', {
                ...context,
                poolAddress,
                page,
                limit,
                total,
                returned: trades.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { trades, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getPoolTrades', 'nad_fun_trades', context);
        }
    }

    /**
     * Get trading statistics for a time period
     */
    async getTradingStats(
        hoursBack: number = 24,
        context: LogContext = {}
    ): Promise<TradingStats> {
        const timer = this.startTimer('getTradingStats');
        const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        
        try {
            const [volumeResult, tradesResult, tradersResult, topTradersResult] = await Promise.all([
                // Total volume
                this.prisma.nadFunTrade.aggregate({
                    where: {
                        timestamp: { gte: cutoffTime }
                    },
                    _sum: {
                        ethAmount: true
                    }
                }),
                // Total trades
                this.prisma.nadFunTrade.count({
                    where: {
                        timestamp: { gte: cutoffTime }
                    }
                }),
                // Unique traders
                this.prisma.nadFunTrade.findMany({
                    where: {
                        timestamp: { gte: cutoffTime }
                    },
                    select: {
                        trader: true
                    },
                    distinct: ['trader']
                }),
                // Top traders
                this.prisma.nadFunTrade.groupBy({
                    by: ['trader'],
                    where: {
                        timestamp: { gte: cutoffTime }
                    },
                    _sum: {
                        ethAmount: true
                    },
                    _count: {
                        trader: true
                    },
                    orderBy: {
                        _sum: {
                            ethAmount: 'desc'
                        }
                    },
                    take: 10
                })
            ]);

            const totalVolume24h = volumeResult._sum.ethAmount || '0';
            const totalTrades24h = tradesResult;
            const uniqueTraders24h = tradersResult.length;
            const avgTradeSize = totalTrades24h > 0 
                ? (BigInt(totalVolume24h) / BigInt(totalTrades24h)).toString()
                : '0';

            const topTraders = topTradersResult.map(result => ({
                trader: result.trader,
                volume: result._sum.ethAmount || '0',
                trades: result._count.trader
            }));

            const stats: TradingStats = {
                totalVolume24h,
                totalTrades24h,
                uniqueTraders24h,
                avgTradeSize,
                topTraders
            };

            const duration = timer.end();
            log.debug('Trading stats retrieved', {
                ...context,
                hoursBack,
                totalVolume24h,
                totalTrades24h,
                uniqueTraders24h,
                duration: `${duration}ms`
            });

            return stats;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTradingStats', 'nad_fun_trades', context);
        }
    }

    /**
     * Update pool statistics
     */
    private async updatePoolStats(
        poolId: string,
        tradeVolume: string,
        context: LogContext = {}
    ): Promise<void> {
        try {
            const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Calculate 24h stats
            const [volumeResult, tradesCount] = await Promise.all([
                this.prisma.nadFunTrade.aggregate({
                    where: {
                        poolId,
                        timestamp: { gte: cutoffTime }
                    },
                    _sum: {
                        ethAmount: true
                    }
                }),
                this.prisma.nadFunTrade.count({
                    where: {
                        poolId,
                        timestamp: { gte: cutoffTime }
                    }
                })
            ]);

            await this.prisma.nadFunPool.update({
                where: { id: poolId },
                data: {
                    volume24h: volumeResult._sum.ethAmount || '0',
                    trades24h: tradesCount,
                    updatedAt: new Date()
                }
            });

        } catch (error) {
            log.error('Failed to update pool stats', {
                ...context,
                poolId,
                tradeVolume,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Calculate total volume for a pool
     */
    private async calculatePoolVolume(poolId: string): Promise<string> {
        try {
            const result = await this.prisma.nadFunTrade.aggregate({
                where: { poolId },
                _sum: {
                    ethAmount: true
                }
            });

            return result._sum.ethAmount?.toString() || '0';
        } catch (error) {
            return '0';
        }
    }

    /**
     * Calculate 24h price change for a pool
     */
    private async calculatePriceChange24h(poolId: string): Promise<string> {
        try {
            const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const [currentPrice, oldestTrade] = await Promise.all([
                this.prisma.nadFunTrade.findFirst({
                    where: { poolId },
                    orderBy: { timestamp: 'desc' },
                    select: { price: true }
                }),
                this.prisma.nadFunTrade.findFirst({
                    where: {
                        poolId,
                        timestamp: { lte: cutoffTime }
                    },
                    orderBy: { timestamp: 'desc' },
                    select: { price: true }
                })
            ]);

            if (!currentPrice || !oldestTrade) {
                return '0';
            }

            const current = parseFloat(currentPrice.price);
            const old = parseFloat(oldestTrade.price);
            
            if (old === 0) return '0';
            
            const change = ((current - old) / old) * 100;
            return change.toFixed(2);
        } catch (error) {
            return '0';
        }
    }

    /**
     * Validate Ethereum address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Get trending pools (by volume or price change)
     */
    async getTrendingPools(
        sortBy: 'volume' | 'priceChange' | 'trades' = 'volume',
        limit: number = 20,
        context: LogContext = {}
    ): Promise<PoolWithStats[]> {
        const timer = this.startTimer('getTrendingPools');
        
        try {
            let orderBy: Prisma.NadFunPoolOrderByWithRelationInput;

            switch (sortBy) {
                case 'volume':
                    orderBy = { volume24h: 'desc' };
                    break;
                case 'trades':
                    orderBy = { trades24h: 'desc' };
                    break;
                default:
                    orderBy = { updatedAt: 'desc' };
            }

            const pools = await this.prisma.nadFunPool.findMany({
                where: {
                    status: PoolStatus.ACTIVE
                },
                take: limit,
                orderBy,
                include: {
                    token: true,
                    trades: {
                        take: 5,
                        orderBy: { timestamp: 'desc' }
                    },
                    _count: {
                        select: { trades: true }
                    }
                }
            });

            // Add stats to pools
            const poolsWithStats: PoolWithStats[] = await Promise.all(
                pools.map(async (pool) => {
                    const [totalVolume, priceChange24h] = await Promise.all([
                        this.calculatePoolVolume(pool.id),
                        this.calculatePriceChange24h(pool.id)
                    ]);

                    return {
                        ...pool,
                        totalTrades: pool._count.trades,
                        totalVolume,
                        priceChange24h,
                        recentTrades: pool.trades
                    };
                })
            );

            const duration = timer.end();
            log.debug('Trending pools retrieved', {
                ...context,
                sortBy,
                limit,
                returned: poolsWithStats.length,
                duration: `${duration}ms`
            });

            return poolsWithStats;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTrendingPools', 'nad_fun_pools', context);
        }
    }

    /**
     * Health check implementation
     */
    async performHealthCheck(): Promise<ServiceHealthCheck> {
        try {
            const [poolCount, tradeCount, activePoolCount, totalVolume] = await Promise.all([
                this.prisma.nadFunPool.count(),
                this.prisma.nadFunTrade.count(),
                this.prisma.nadFunPool.count({ where: { status: PoolStatus.ACTIVE } }),
                this.prisma.nadFunTrade.aggregate({
                    _sum: { ethAmount: true }
                })
            ]);

            return {
                status: 'healthy',
                details: {
                    poolCount,
                    tradeCount,
                    activePoolCount,
                    totalVolume: totalVolume._sum.ethAmount || '0',
                    database: 'connected'
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    database: 'disconnected'
                }
            };
        }
    }
}