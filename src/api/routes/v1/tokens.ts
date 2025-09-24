/**
 * Token tracking routes for ERC-20 and other token standards
 */

import { Router } from 'express';
import { TokenTrackingController } from '../../controllers/token-tracking-controller';
import { validateBody, validateParams, validateQuery } from '../../../middleware/validation';
import { authenticate, optionalAuthenticate, requireRoles } from '../../../middleware';
import Joi from 'joi';

const router = Router();
const tokenTrackingController = new TokenTrackingController();

// Validation schemas
const tokenQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderBy: Joi.string().valid('name', 'symbol', 'createdAt').optional(),
    orderDirection: Joi.string().valid('asc', 'desc').optional(),
    search: Joi.string().min(1).max(100).optional(),
    tokenType: Joi.string().valid('ERC20', 'ERC721', 'ERC1155', 'NATIVE', 'OTHER').optional(),
    verified: Joi.boolean().optional()
});

const contractAddressSchema = Joi.object({
    contractAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const addressSchema = Joi.object({
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const transferQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderDirection: Joi.string().valid('asc', 'desc').optional()
});

const topTokensQuerySchema = Joi.object({
    sortBy: Joi.string().valid('volume', 'holders', 'transfers').optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
});

const createTokenSchema = Joi.object({
    contractAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    name: Joi.string().min(1).max(100).required(),
    symbol: Joi.string().min(1).max(20).required(),
    decimals: Joi.number().integer().min(0).max(18).required(),
    totalSupply: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    tokenType: Joi.string().valid('ERC20', 'ERC721', 'ERC1155', 'NATIVE', 'OTHER').optional(),
    logoUrl: Joi.string().uri().optional(),
    website: Joi.string().uri().optional(),
    description: Joi.string().max(500).optional(),
    isVerified: Joi.boolean().optional()
});

const searchQuerySchema = Joi.object({
    q: Joi.string().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(100).optional()
});

/**
 * @swagger
 * /api/v1/tokens:
 *   get:
 *     summary: Get tokens with pagination and filtering
 *     tags: [Tokens]
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
 *         description: Number of tokens per page
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [name, symbol, createdAt]
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
 *         description: Search by token name, symbol, or contract address
 *       - in: query
 *         name: tokenType
 *         schema:
 *           type: string
 *           enum: [ERC20, ERC721, ERC1155, NATIVE, OTHER]
 *         description: Filter by token type
 *       - in: query
 *         name: verified
 *         schema:
 *           type: boolean
 *         description: Filter by verification status
 *     responses:
 *       200:
 *         description: List of tokens with statistics
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/',
    optionalAuthenticate,
    validateQuery(tokenQuerySchema),
    tokenTrackingController.getTokens
);

/**
 * @swagger
 * /api/v1/tokens/top:
 *   get:
 *     summary: Get top tokens by various metrics
 *     tags: [Tokens]
 *     parameters:
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [volume, holders, transfers]
 *           default: volume
 *         description: Metric to sort by
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of tokens to return
 *     responses:
 *       200:
 *         description: List of top tokens with statistics
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/top',
    optionalAuthenticate,
    validateQuery(topTokensQuerySchema),
    tokenTrackingController.getTopTokens
);

/**
 * @swagger
 * /api/v1/tokens/search:
 *   get:
 *     summary: Search tokens
 *     tags: [Tokens]
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
    tokenTrackingController.searchTokens
);

/**
 * @swagger
 * /api/v1/tokens:
 *   post:
 *     summary: Create or update a token (admin only)
 *     tags: [Tokens]
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
 *               - contractAddress
 *               - name
 *               - symbol
 *               - decimals
 *             properties:
 *               contractAddress:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Token contract address
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 description: Token name
 *               symbol:
 *                 type: string
 *                 maxLength: 20
 *                 description: Token symbol
 *               decimals:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 18
 *                 description: Token decimals
 *               totalSupply:
 *                 oneOf:
 *                   - type: string
 *                   - type: number
 *                 description: Total token supply
 *               tokenType:
 *                 type: string
 *                 enum: [ERC20, ERC721, ERC1155, NATIVE, OTHER]
 *                 default: ERC20
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               isVerified:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Token created/updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/',
    authenticate,
    requireRoles('ADMIN'),
    validateBody(createTokenSchema),
    tokenTrackingController.createOrUpdateToken
);

/**
 * @swagger
 * /api/v1/tokens/{contractAddress}:
 *   get:
 *     summary: Get token by contract address
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Token contract address
 *     responses:
 *       200:
 *         description: Token details with statistics
 *       400:
 *         description: Invalid contract address
 *       404:
 *         description: Token not found
 *       500:
 *         description: Server error
 */
router.get('/:contractAddress',
    optionalAuthenticate,
    validateParams(contractAddressSchema),
    tokenTrackingController.getTokenByAddress
);

/**
 * @swagger
 * /api/v1/tokens/{contractAddress}/transfers:
 *   get:
 *     summary: Get token transfers for a specific token
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Token contract address
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
 *         description: Number of transfers per page
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of token transfers
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Token not found
 *       500:
 *         description: Server error
 */
router.get('/:contractAddress/transfers',
    optionalAuthenticate,
    validateParams(contractAddressSchema),
    validateQuery(transferQuerySchema),
    tokenTrackingController.getTokenTransfers
);

/**
 * @swagger
 * /api/v1/tokens/{contractAddress}/balances/{address}:
 *   get:
 *     summary: Get token balance for an address
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Token contract address
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Address to check balance for
 *     responses:
 *       200:
 *         description: Token balance information
 *       400:
 *         description: Invalid address format
 *       500:
 *         description: Server error
 */
router.get('/:contractAddress/balances/:address',
    optionalAuthenticate,
    validateParams(Joi.object({
        contractAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
        address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
    })),
    tokenTrackingController.getTokenBalance
);

/**
 * @swagger
 * /api/v1/addresses/{address}/token-balances:
 *   get:
 *     summary: Get all token balances for an address
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Address to get token balances for
 *     responses:
 *       200:
 *         description: List of token balances for the address
 *       400:
 *         description: Invalid address format
 *       500:
 *         description: Server error
 */
router.get('/addresses/:address/token-balances',
    optionalAuthenticate,
    validateParams(addressSchema),
    tokenTrackingController.getAddressTokenBalances
);

export default router;