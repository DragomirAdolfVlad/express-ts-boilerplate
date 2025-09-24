/**
 * nad.fun Controller
 * Handles HTTP requests for nad.fun program data and analytics
 */

import { Request, Response, NextFunction } from 'express';
import { BaseController } from './base-controller';
import { log } from '../../utils/logger';
import { Timer } from '../../utils/timer';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { getService } from '../../services/di/container';
import { NadFunService } from '../../services/blockchain/nad-fun-service';
import { NadFunEventType } from '@prisma/client';

export class NadFunController extends BaseController {
    private nadFunService: NadFunService;

    constructor() {
        super();
        this.nadFunService = getService<NadFunService>('nadFunService');
    }

    /**
     * GET /api/v1/nad-fun/tokens - Get nad.fun tokens with pagination
     */
    getTokens = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getTokens'
        });

        logger.info('Getting nad.fun tokens list');

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const sortBy = req.query.sortBy as string || 'createdAt';
        const sortOrder = req.query.sortOrder as string || 'desc';
        const search = req.query.search as string;

        // Build where clause
        const where: any = { isActive: true };
        
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { symbol: { contains: search, mode: 'insensitive' } },
                { tokenAddress: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Build order by clause
        const orderBy: any = {};
        if (sortBy === 'marketCap') {
            orderBy.marketCap = sortOrder;
        } else if (sortBy === 'currentPrice') {
            orderBy.currentPrice = sortOrder;
        } else if (sortBy === 'volume24h') {
            orderBy.volume24h = sortOrder;
        } else {
            orderBy.createdAt = sortOrder;
        }

        const skip = (page - 1) * limit;

        const [tokens, total] = await Promise.all([
            this.nadFunService.prisma.nadFunToken.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                select: {
                    id: true,
                    tokenAddress: true,
                    name: true,
                    symbol: true,
                    totalSupply: true,
                    creator: true,
                    currentPrice: true,
                    marketCap: true,
                    volume24h: true,
                    holders: true,
                    createdAt: true,
                    updatedAt: true
                }
            }),
            this.nadFunService.prisma.nadFunToken.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);
        const duration = timer.end();

        logger.info('nad.fun tokens retrieved successfully', {
            count: tokens.length,
            total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: tokens.map(token => ({
                ...token,
                totalSupply: token.totalSupply.toString(),
                currentPrice: token.currentPrice?.toString(),
                marketCap: token.marketCap?.toString(),
                volume24h: token.volume24h?.toString()
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    });

    /**
     * GET /api/v1/nad-fun/tokens/:tokenAddress - Get specific nad.fun token
     */
    getToken = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getToken'
        });

        const tokenAddress = req.params.tokenAddress.toLowerCase();
        logger.info('Getting nad.fun token details', { tokenAddress });

        const token = await this.nadFunService.prisma.nadFunToken.findUnique({
            where: { tokenAddress },
            include: {
                priceHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 100 // Last 100 price points
                }
            }
        });

        if (!token) {
            throw new NotFoundError(`Token ${tokenAddress} not found`);
        }

        // Get recent events
        const recentEvents = await this.nadFunService.getTokenEvents(
            tokenAddress,
            undefined,
            1,
            20
        );

        const duration = timer.end();
        logger.info('nad.fun token retrieved successfully', {
            tokenAddress,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                ...token,
                totalSupply: token.totalSupply.toString(),
                currentPrice: token.currentPrice?.toString(),
                marketCap: token.marketCap?.toString(),
                volume24h: token.volume24h?.toString(),
                priceHistory: token.priceHistory.map(history => ({
                    ...history,
                    price: history.price.toString(),
                    volume: history.volume.toString(),
                    marketCap: history.marketCap?.toString(),
                    blockNumber: history.blockNumber.toString()
                })),
                recentEvents: recentEvents.data.map(event => ({
                    ...event,
                    blockNumber: event.blockNumber.toString(),
                    amount: event.amount?.toString(),
                    price: event.price?.toString()
                }))
            }
        });
    });

    /**
     * GET /api/v1/nad-fun/tokens/:tokenAddress/price-history - Get token price history
     */
    getTokenPriceHistory = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getTokenPriceHistory'
        });

        const tokenAddress = req.params.tokenAddress.toLowerCase();
        const timeframe = req.query.timeframe as string || '24h';
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

        logger.info('Getting token price history', { tokenAddress, timeframe, limit });

        // Calculate time filter based on timeframe
        let timeFilter: Date | undefined;
        const now = new Date();
        
        switch (timeframe) {
            case '1h':
                timeFilter = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                timeFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                timeFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                timeFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
        }

        const where: any = { tokenAddress };
        if (timeFilter) {
            where.timestamp = { gte: timeFilter };
        }

        const priceHistory = await this.nadFunService.prisma.tokenPriceHistory.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit
        });

        const duration = timer.end();
        logger.info('Token price history retrieved successfully', {
            tokenAddress,
            count: priceHistory.length,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: priceHistory.map(history => ({
                ...history,
                price: history.price.toString(),
                volume: history.volume.toString(),
                marketCap: history.marketCap?.toString(),
                blockNumber: history.blockNumber.toString()
            }))
        });
    });

    /**
     * GET /api/v1/nad-fun/events - Get nad.fun events with pagination
     */
    getEvents = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getEvents'
        });

        logger.info('Getting nad.fun events list');

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const eventTypes = req.query.eventTypes ? (req.query.eventTypes as string).split(',') as NadFunEventType[] : undefined;
        const tokenAddress = req.query.tokenAddress as string;
        const userAddress = req.query.userAddress as string;

        // Build where clause
        const where: any = {};
        
        if (eventTypes && eventTypes.length > 0) {
            where.eventType = { in: eventTypes };
        }

        if (tokenAddress) {
            where.tokenAddress = tokenAddress.toLowerCase();
        }

        if (userAddress) {
            where.userAddress = userAddress.toLowerCase();
        }

        const skip = (page - 1) * limit;

        const [events, total] = await Promise.all([
            this.nadFunService.prisma.nadFunEvent.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit
            }),
            this.nadFunService.prisma.nadFunEvent.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);
        const duration = timer.end();

        logger.info('nad.fun events retrieved successfully', {
            count: events.length,
            total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: events.map(event => ({
                ...event,
                blockNumber: event.blockNumber.toString(),
                amount: event.amount?.toString(),
                price: event.price?.toString()
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    });

    /**
     * GET /api/v1/nad-fun/tokens/:tokenAddress/events - Get events for specific token
     */
    getTokenEvents = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getTokenEvents'
        });

        const tokenAddress = req.params.tokenAddress.toLowerCase();
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const eventTypes = req.query.eventTypes ? (req.query.eventTypes as string).split(',') as NadFunEventType[] : undefined;

        logger.info('Getting token events', { tokenAddress, eventTypes });

        const result = await this.nadFunService.getTokenEvents(
            tokenAddress,
            eventTypes,
            page,
            limit,
            { requestId: req.headers['x-request-id'] as string }
        );

        const duration = timer.end();
        logger.info('Token events retrieved successfully', {
            tokenAddress,
            count: result.data.length,
            total: result.total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: result.data.map(event => ({
                ...event,
                blockNumber: event.blockNumber.toString(),
                amount: event.amount?.toString(),
                price: event.price?.toString()
            })),
            pagination: {
                page: result.page,
                limit,
                total: result.total,
                totalPages: result.totalPages
            }
        });
    });

    /**
     * GET /api/v1/nad-fun/analytics/overview - Get nad.fun analytics overview
     */
    getAnalyticsOverview = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getAnalyticsOverview'
        });

        logger.info('Getting nad.fun analytics overview');

        // Get various analytics data
        const [
            totalTokens,
            activeTokens,
            totalEvents,
            recentEvents,
            topTokensByMarketCap,
            topTokensByVolume,
            eventCounts
        ] = await Promise.all([
            // Total tokens count
            this.nadFunService.prisma.nadFunToken.count(),
            
            // Active tokens count (tokens with recent activity)
            this.nadFunService.prisma.nadFunToken.count({
                where: {
                    isActive: true,
                    updatedAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    }
                }
            }),
            
            // Total events count
            this.nadFunService.prisma.nadFunEvent.count(),
            
            // Recent events count (last 24 hours)
            this.nadFunService.prisma.nadFunEvent.count({
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            }),
            
            // Top tokens by market cap
            this.nadFunService.prisma.nadFunToken.findMany({
                where: {
                    isActive: true,
                    marketCap: { not: null }
                },
                orderBy: { marketCap: 'desc' },
                take: 10,
                select: {
                    tokenAddress: true,
                    name: true,
                    symbol: true,
                    currentPrice: true,
                    marketCap: true,
                    volume24h: true
                }
            }),
            
            // Top tokens by volume
            this.nadFunService.prisma.nadFunToken.findMany({
                where: {
                    isActive: true,
                    volume24h: { not: null }
                },
                orderBy: { volume24h: 'desc' },
                take: 10,
                select: {
                    tokenAddress: true,
                    name: true,
                    symbol: true,
                    currentPrice: true,
                    marketCap: true,
                    volume24h: true
                }
            }),
            
            // Event counts by type
            this.nadFunService.prisma.nadFunEvent.groupBy({
                by: ['eventType'],
                _count: {
                    id: true
                },
                where: {
                    timestamp: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            })
        ]);

        const duration = timer.end();
        logger.info('nad.fun analytics overview retrieved successfully', {
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                summary: {
                    totalTokens,
                    activeTokens,
                    totalEvents,
                    recentEvents
                },
                topTokensByMarketCap: topTokensByMarketCap.map(token => ({
                    ...token,
                    currentPrice: token.currentPrice?.toString(),
                    marketCap: token.marketCap?.toString(),
                    volume24h: token.volume24h?.toString()
                })),
                topTokensByVolume: topTokensByVolume.map(token => ({
                    ...token,
                    currentPrice: token.currentPrice?.toString(),
                    marketCap: token.marketCap?.toString(),
                    volume24h: token.volume24h?.toString()
                })),
                eventCountsByType: eventCounts.reduce((acc, item) => {
                    acc[item.eventType] = item._count.id;
                    return acc;
                }, {} as Record<string, number>)
            }
        });
    });

    /**
     * GET /api/v1/nad-fun/users/:userAddress/activity - Get user activity
     */
    getUserActivity = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'NadFunController',
            action: 'getUserActivity'
        });

        const userAddress = req.params.userAddress.toLowerCase();
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        logger.info('Getting user activity', { userAddress });

        const skip = (page - 1) * limit;

        const [userEvents, total, userStats] = await Promise.all([
            // Get user events
            this.nadFunService.prisma.nadFunEvent.findMany({
                where: { userAddress },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit
            }),
            
            // Get total user events count
            this.nadFunService.prisma.nadFunEvent.count({
                where: { userAddress }
            }),
            
            // Get user statistics
            this.nadFunService.prisma.nadFunEvent.groupBy({
                by: ['eventType'],
                where: { userAddress },
                _count: {
                    id: true
                }
            })
        ]);

        const totalPages = Math.ceil(total / limit);
        const duration = timer.end();

        logger.info('User activity retrieved successfully', {
            userAddress,
            count: userEvents.length,
            total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                events: userEvents.map(event => ({
                    ...event,
                    blockNumber: event.blockNumber.toString(),
                    amount: event.amount?.toString(),
                    price: event.price?.toString()
                })),
                statistics: userStats.reduce((acc, item) => {
                    acc[item.eventType] = item._count.id;
                    return acc;
                }, {} as Record<string, number>)
            },
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    });
}