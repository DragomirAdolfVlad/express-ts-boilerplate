/**
 * nad.fun routes for liquidity pools and trading data
 */

import { Router } from 'express';
import { NadFunController } from '../../controllers/nad-fun-controller';
import { validateBody, validateParams, validateQuery } from '../../../middleware/validation';
import { authenticate, optionalAuthenticate, requireRoles } from '../../../middleware';
import Joi from 'joi';

const router = Router();
const nadFunController = new NadFunController();

// Validation schemas
const poolsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderBy: Joi.string().valid('createdAt', 'volume24h', 'marketCap', 'price').optional(),
    orderDirection: Joi.string().valid('asc', 'desc').optional(),
    search: Joi.string().min(1).max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'MIGRATED', 'DEPRECATED').optional(),
    minVolume: Joi.string().optional()
});

const poolAddressSchema = Joi.object({
    poolAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const poolTradesQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderDirection: Joi.string().valid('asc', 'desc').optional(),
    tradeType: Joi.string().valid('BUY', 'SELL', 'SWAP').optional(),
    trader: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
    fromTimestamp: Joi.date().iso().optional(),
    toTimestamp: Joi.date().iso().optional()
});

const trendingQuerySchema = Joi.object({
    sortBy: Joi.string().valid('volume', 'priceChange', 'trades').optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
});

const statsQuerySchema = Joi.object({
    hours: Joi.number().integer().min(1).max(168).optional()
});

const createPoolSchema = Joi.object({
    tokenId: Joi.string().required(),
    poolAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    reserveToken: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    reserveAmount: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    tokenAmount: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    price: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    marketCap: Joi.alternatives().try(Joi.string(), Joi.number()).optional()
});

const createTradeSchema = Joi.object({
    poolId: Joi.string().required(),
    transactionId: Joi.string().required(),
    trader: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    tradeType: Joi.string().valid('BUY', 'SELL', 'SWAP').required(),
    tokenAmount: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    ethAmount: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    price: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    slippage: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    timestamp: Joi.date().iso().required()
});

const searchQuerySchema = Joi.object({
    q: Joi.string().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(100).optional()
});

/**
 * @swagger
 * /api/v1/nad-fun/pools:
 *   get:
 *     summary: Get all pools with pagination and filtering
 *     tags: [nad.fun]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of pools per page
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [createdAt, volume24h, marketCap, price]
 *           default: createdAt
 *         description: Field to order by
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Search by token name, symbol, or pool address
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, MIGRATED, DEPRECATED]
 *         description: Filter by pool status
 *       - in: query
 *         name: minVolume
 *         schema:
 *           type: string
 *         description: Minimum 24h volume filter
 *     responses:
 *       200:
 *         description: List of pools with statistics
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/pools',
    optionalAuthenticate,
    validateQuery(poolsQuerySchema),
    nadFunController.getPools
);

/**
 * @swagger
 * /api/v1/nad-fun/trending:
 *   get:
 *     summary: Get trending pools
 *     tags: [nad.fun]
 *     parameters:
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [volume, priceChange, trades]
 *           default: volume
 *         description: Metric to sort by
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of pools to return
 *     responses:
 *       200:
 *         description: List of trending pools
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/trending',
    optionalAuthenticate,
    validateQuery(trendingQuerySchema),
    nadFunController.getTrendingPools
);

/**
 * @swagger
 * /api/v1/nad-fun/stats:
 *   get:
 *     summary: Get trading statistics
 *     tags: [nad.fun]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 24
 *         description: Number of hours to look back for statistics
 *     responses:
 *       200:
 *         description: Trading statistics
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/stats',
    optionalAuthenticate,
    validateQuery(statsQuerySchema),
    nadFunController.getTradingStats
);

/**
 * @swagger
 * /api/v1/nad-fun/search:
 *   get:
 *     summary: Search pools
 *     tags: [nad.fun]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Invalid search query
 *       500:
 *         description: Server error
 */
router.get('/search',
    optionalAuthenticate,
    validateQuery(searchQuerySchema),
    nadFunController.searchPools
);

/**
 * @swagger
 * /api/v1/nad-fun/pools:
 *   post:
 *     summary: Create or update a pool (admin only)
 *     tags: [nad.fun]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tokenId
 *               - poolAddress
 *               - reserveToken
 *               - reserveAmount
 *               - tokenAmount
 *             properties:
 *               tokenId:
 *                 type: string
 *                 description: Token ID reference
 *               poolAddress:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Pool contract address
 *               reserveToken:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Reserve token address (usually ETH/MON)
 *               reserveAmount:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Amount of reserve tokens in pool
 *               tokenAmount:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Amount of tokens in pool
 *               price:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Current token price
 *               marketCap:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Market capitalization
 *     responses:
 *       201:
 *         description: Pool created/updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/pools',
    authenticate,
    requireRoles('ADMIN'),
    validateBody(createPoolSchema),
    nadFunController.createOrUpdatePool
);

/**
 * @swagger
 * /api/v1/nad-fun/trades:
 *   post:
 *     summary: Create a trade record (internal/webhook endpoint)
 *     tags: [nad.fun]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - poolId
 *               - transactionId
 *               - trader
 *               - tradeType
 *               - tokenAmount
 *               - ethAmount
 *               - price
 *               - timestamp
 *             properties:
 *               poolId:
 *                 type: string
 *                 description: Pool ID reference
 *               transactionId:
 *                 type: string
 *                 description: Transaction ID reference
 *               trader:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Trader address
 *               tradeType:
 *                 type: string
 *                 enum: [BUY, SELL, SWAP]
 *                 description: Type of trade
 *               tokenAmount:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Amount of tokens traded
 *               ethAmount:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Amount of ETH/MON traded
 *               price:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Price at time of trade
 *               slippage:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Slippage percentage
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Trade timestamp
 *     responses:
 *       201:
 *         description: Trade created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/trades',
    authenticate,
    requireRoles('ADMIN', 'SERVICE'),
    validateBody(createTradeSchema),
    nadFunController.createTrade
);

/**
 * @swagger
 * /api/v1/nad-fun/pools/{poolAddress}:
 *   get:
 *     summary: Get pool by address with detailed stats
 *     tags: [nad.fun]
 *     parameters:
 *       - in: path
 *         name: poolAddress
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Pool contract address
 *     responses:
 *       200:
 *         description: Pool details with statistics
 *       400:
 *         description: Invalid pool address
 *       404:
 *         description: Pool not found
 *       500:
 *         description: Server error
 */
router.get('/pools/:poolAddress',
    optionalAuthenticate,
    validateParams(poolAddressSchema),
    nadFunController.getPoolByAddress
);

/**
 * @swagger
 * /api/v1/nad-fun/pools/{poolAddress}/trades:
 *   get:
 *     summary: Get trades for a specific pool
 *     tags: [nad.fun]
 *     parameters:
 *       - in: path
 *         name: poolAddress
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Pool contract address
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of trades per page
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *       - in: query
 *         name: tradeType
 *         schema:
 *           type: string
 *           enum: [BUY, SELL, SWAP]
 *         description: Filter by trade type
 *       - in: query
 *         name: trader
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Filter by trader address
 *       - in: query
 *         name: fromTimestamp
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start timestamp for filtering trades
 *       - in: query
 *         name: toTimestamp
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End timestamp for filtering trades
 *     responses:
 *       200:
 *         description: List of trades for the pool
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Pool not found
 *       500:
 *         description: Server error
 */
router.get('/pools/:poolAddress/trades',
    optionalAuthenticate,
    validateParams(poolAddressSchema),
    validateQuery(poolTradesQuerySchema),
    nadFunController.getPoolTrades
);

export default router;