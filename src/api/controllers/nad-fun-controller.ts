/**
 * nad.fun controller for liquidity pools and trading data
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { NadFunService } from '../../services/database/nad-fun-service';
import { getContainer } from '../../services/di/container';
import { log } from '../../utils/logger';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { PoolStatus, TradeType } from '@prisma/client';

export class NadFunController extends BaseController {
    private nadFunService: NadFunService;

    constructor() {
        super();
        this.nadFunService = getContainer().nadFunService;
    }

    /**
     * Get all pools with pagination and filtering
     * GET /api/v1/nad-fun/pools
     */
    getPools = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Fetching nad.fun pools');

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderBy = (req.query.orderBy as string) || 'createdAt';
            const orderDirection = (req.query.orderDirection as string) || 'desc';
            const search = req.query.search as string;
            const status = req.query.status as PoolStatus;
            const minVolume = req.query.minVolume as string;

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['createdAt', 'volume24h', 'marketCap', 'price'].includes(orderBy)) {
                throw new ValidationError('Invalid orderBy field', 'orderBy');
            }

            if (!['asc', 'desc'].includes(orderDirection)) {
                throw new ValidationError('Invalid orderDirection', 'orderDirection');
            }

            if (status && !Object.values(PoolStatus).includes(status)) {
                throw new ValidationError('Invalid pool status', 'status');
            }

            const result = await this.nadFunService.getPools(
                {
                    page,
                    limit,
                    orderBy: orderBy as any,
                    orderDirection: orderDirection as any,
                    search,
                    status,
                    minVolume
                },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('nad.fun pools fetched successfully', {
                page,
                limit,
                total: result.total,
                returned: result.pools.length,
                filters: { search, status, minVolume },
                duration: `${duration}ms`
            });

            this.ok(res, {
                pools: result.pools,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    hasMore: result.hasMore,
                    totalPages: Math.ceil(result.total / limit)
                }
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get pool by address with detailed stats
     * GET /api/v1/nad-fun/pools/:poolAddress
     */
    getPoolByAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const poolAddress = req.params.poolAddress;

            // Validate pool address format
            if (!this.isValidAddress(poolAddress)) {
                throw new ValidationError('Invalid pool address format', 'poolAddress');
            }

            logger.info('Fetching nad.fun pool by address', { poolAddress });

            const pool = await this.nadFunService.getPoolByAddress(
                poolAddress.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            if (!pool) {
                throw new NotFoundError('Pool not found');
            }

            const duration = timer.end();
            logger.info('nad.fun pool fetched successfully', {
                poolAddress,
                tokenSymbol: pool.token.symbol,
                totalTrades: pool.totalTrades,
                totalVolume: pool.totalVolume,
                duration: `${duration}ms`
            });

            this.ok(res, { pool });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get trades for a specific pool
     * GET /api/v1/nad-fun/pools/:poolAddress/trades
     */
    getPoolTrades = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const poolAddress = req.params.poolAddress;

            // Validate pool address format
            if (!this.isValidAddress(poolAddress)) {
                throw new ValidationError('Invalid pool address format', 'poolAddress');
            }

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderDirection = (req.query.orderDirection as string) || 'desc';
            const tradeType = req.query.tradeType as TradeType;
            const trader = req.query.trader as string;
            
            // Parse timestamps if provided
            const fromTimestamp = req.query.fromTimestamp ? 
                new Date(req.query.fromTimestamp as string) : undefined;
            const toTimestamp = req.query.toTimestamp ? 
                new Date(req.query.toTimestamp as string) : undefined;

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['asc', 'desc'].includes(orderDirection)) {
                throw new ValidationError('Invalid orderDirection', 'orderDirection');
            }

            if (tradeType && !Object.values(TradeType).includes(tradeType)) {
                throw new ValidationError('Invalid trade type', 'tradeType');
            }

            if (trader && !this.isValidAddress(trader)) {
                throw new ValidationError('Invalid trader address format', 'trader');
            }

            logger.info('Fetching pool trades', {
                poolAddress,
                page,
                limit,
                filters: { tradeType, trader }
            });

            const result = await this.nadFunService.getPoolTrades(
                poolAddress.toLowerCase(),
                {
                    page,
                    limit,
                    orderDirection: orderDirection as any,
                    tradeType,
                    trader: trader?.toLowerCase(),
                    fromTimestamp,
                    toTimestamp
                },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Pool trades fetched successfully', {
                poolAddress,
                page,
                limit,
                total: result.total,
                returned: result.trades.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                poolAddress,
                trades: result.trades,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    hasMore: result.hasMore,
                    totalPages: Math.ceil(result.total / limit)
                }
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get trending pools
     * GET /api/v1/nad-fun/trending
     */
    getTrendingPools = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const sortBy = (req.query.sortBy as string) || 'volume';
            const limit = this.parseIntQuery(req.query.limit as string, 20);

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['volume', 'priceChange', 'trades'].includes(sortBy)) {
                throw new ValidationError('Invalid sortBy field', 'sortBy');
            }

            logger.info('Fetching trending pools', {
                sortBy,
                limit
            });

            const trendingPools = await this.nadFunService.getTrendingPools(
                sortBy as any,
                limit,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Trending pools fetched successfully', {
                sortBy,
                limit,
                returned: trendingPools.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                sortBy,
                limit,
                pools: trendingPools,
                count: trendingPools.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get trading statistics
     * GET /api/v1/nad-fun/stats
     */
    getTradingStats = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const hoursBack = this.parseIntQuery(req.query.hours as string, 24);

            // Validate parameters
            if (hoursBack > 168) { // 1 week max
                throw new ValidationError('Hours back cannot exceed 168 (1 week)', 'hours');
            }

            logger.info('Fetching trading statistics', { hoursBack });

            const stats = await this.nadFunService.getTradingStats(
                hoursBack,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Trading statistics fetched successfully', {
                hoursBack,
                totalVolume24h: stats.totalVolume24h,
                totalTrades24h: stats.totalTrades24h,
                uniqueTraders24h: stats.uniqueTraders24h,
                duration: `${duration}ms`
            });

            this.ok(res, {
                hoursBack,
                stats
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Create or update a pool (admin endpoint)
     * POST /api/v1/nad-fun/pools
     */
    createOrUpdatePool = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Creating/updating nad.fun pool');

            // Validate required fields
            this.validateRequired(req.body, [
                'tokenId', 
                'poolAddress', 
                'reserveToken', 
                'reserveAmount', 
                'tokenAmount'
            ]);

            const {
                tokenId,
                poolAddress,
                reserveToken,
                reserveAmount,
                tokenAmount,
                price,
                marketCap
            } = req.body;

            // Validate addresses
            if (!this.isValidAddress(poolAddress)) {
                throw new ValidationError('Invalid pool address format', 'poolAddress');
            }

            if (!this.isValidAddress(reserveToken)) {
                throw new ValidationError('Invalid reserve token address format', 'reserveToken');
            }

            // Validate amounts are valid numbers
            if (!this.isValidAmount(reserveAmount)) {
                throw new ValidationError('Invalid reserve amount', 'reserveAmount');
            }

            if (!this.isValidAmount(tokenAmount)) {
                throw new ValidationError('Invalid token amount', 'tokenAmount');
            }

            if (price && !this.isValidAmount(price)) {
                throw new ValidationError('Invalid price', 'price');
            }

            if (marketCap && !this.isValidAmount(marketCap)) {
                throw new ValidationError('Invalid market cap', 'marketCap');
            }

            const poolData = {
                tokenId,
                poolAddress: poolAddress.toLowerCase(),
                reserveToken: reserveToken.toLowerCase(),
                reserveAmount: reserveAmount.toString(),
                tokenAmount: tokenAmount.toString(),
                price: price?.toString(),
                marketCap: marketCap?.toString()
            };

            const pool = await this.nadFunService.createOrUpdatePool(
                poolData,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('nad.fun pool created/updated successfully', {
                poolId: pool.id,
                poolAddress: pool.poolAddress,
                tokenSymbol: pool.token.symbol,
                duration: `${duration}ms`
            });

            this.created(res, { pool });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Create a trade record (internal/webhook endpoint)
     * POST /api/v1/nad-fun/trades
     */
    createTrade = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Creating nad.fun trade');

            // Validate required fields
            this.validateRequired(req.body, [
                'poolId',
                'transactionId', 
                'trader',
                'tradeType',
                'tokenAmount',
                'ethAmount',
                'price',
                'timestamp'
            ]);

            const {
                poolId,
                transactionId,
                trader,
                tradeType,
                tokenAmount,
                ethAmount,
                price,
                slippage,
                timestamp
            } = req.body;

            // Validate trader address format
            if (!this.isValidAddress(trader)) {
                throw new ValidationError('Invalid trader address format', 'trader');
            }

            // Validate trade type
            if (!Object.values(TradeType).includes(tradeType)) {
                throw new ValidationError('Invalid trade type', 'tradeType');
            }

            // Validate amounts
            if (!this.isValidAmount(tokenAmount)) {
                throw new ValidationError('Invalid token amount', 'tokenAmount');
            }

            if (!this.isValidAmount(ethAmount)) {
                throw new ValidationError('Invalid ETH amount', 'ethAmount');
            }

            if (!this.isValidAmount(price)) {
                throw new ValidationError('Invalid price', 'price');
            }

            if (slippage && !this.isValidAmount(slippage)) {
                throw new ValidationError('Invalid slippage', 'slippage');
            }

            // Validate timestamp
            const tradeTimestamp = new Date(timestamp);
            if (isNaN(tradeTimestamp.getTime())) {
                throw new ValidationError('Invalid timestamp format', 'timestamp');
            }

            const tradeData = {
                poolId,
                transactionId,
                trader: trader.toLowerCase(),
                tradeType,
                tokenAmount: tokenAmount.toString(),
                ethAmount: ethAmount.toString(),
                price: price.toString(),
                slippage: slippage?.toString(),
                timestamp: tradeTimestamp
            };

            const trade = await this.nadFunService.createTrade(
                tradeData,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('nad.fun trade created successfully', {
                tradeId: trade.id,
                tokenSymbol: trade.pool.token.symbol,
                tradeType: trade.tradeType,
                trader: trade.trader,
                duration: `${duration}ms`
            });

            this.created(res, { trade });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Search pools
     * GET /api/v1/nad-fun/search
     */
    searchPools = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const query = req.query.q as string;
            const limit = this.parseIntQuery(req.query.limit as string, 20);

            if (!query) {
                throw new ValidationError('Search query is required', 'q');
            }

            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            logger.info('Searching nad.fun pools', { query, limit });

            const result = await this.nadFunService.getPools(
                {
                    page: 1,
                    limit,
                    search: query,
                    orderBy: 'volume24h',
                    orderDirection: 'desc'
                },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Pool search completed', {
                query,
                returned: result.pools.length,
                total: result.total,
                duration: `${duration}ms`
            });

            this.ok(res, {
                query,
                pools: result.pools,
                count: result.pools.length,
                hasMore: result.hasMore
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Helper method to validate address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Helper method to validate amount format
     */
    private isValidAmount(amount: any): boolean {
        if (typeof amount === 'number') {
            return amount >= 0 && !isNaN(amount) && isFinite(amount);
        }
        if (typeof amount === 'string') {
            const num = parseFloat(amount);
            return !isNaN(num) && isFinite(num) && num >= 0;
        }
        return false;
    }
}