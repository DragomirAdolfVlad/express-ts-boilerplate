/**
 * Blockchain routes for Monad blockchain data
 */

import { Router } from 'express';
import { BlockchainController } from '../../controllers/blockchain-controller';
import { validateQuery, validateParams } from '../../../middleware/validation';
import { authenticate, optionalAuthenticate } from '../../../middleware';
import Joi from 'joi';

const router = Router();
const blockchainController = new BlockchainController();

// Validation schemas
const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    orderBy: Joi.string().valid('blockNumber', 'timestamp').optional(),
    orderDirection: Joi.string().valid('asc', 'desc').optional()
});

const blockNumberSchema = Joi.object({
    blockNumber: Joi.string().pattern(/^\d+$/).required()
});

const txHashSchema = Joi.object({
    txHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required()
});

const addressSchema = Joi.object({
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const searchSchema = Joi.object({
    q: Joi.string().min(1).max(100).required()
});

// Routes

/**
 * @swagger
 * /api/v1/blockchain/blocks:
 *   get:
 *     summary: Get latest blocks with pagination
 *     tags: [Blockchain]
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
 *         description: Number of blocks per page
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [blockNumber, timestamp]
 *           default: blockNumber
 *         description: Field to order by
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of blocks with pagination info
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/blocks',
    optionalAuthenticate,
    validateQuery(paginationSchema),
    blockchainController.getLatestBlocks
);

/**
 * @swagger
 * /api/v1/blockchain/blocks/{blockNumber}:
 *   get:
 *     summary: Get block by number
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: blockNumber
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\\d+$'
 *         description: Block number
 *       - in: query
 *         name: includeTransactions
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include transactions in response
 *     responses:
 *       200:
 *         description: Block details
 *       400:
 *         description: Invalid block number
 *       404:
 *         description: Block not found
 *       500:
 *         description: Server error
 */
router.get('/blocks/:blockNumber',
    optionalAuthenticate,
    validateParams(blockNumberSchema),
    blockchainController.getBlockByNumber
);

/**
 * @swagger
 * /api/v1/blockchain/transactions/{txHash}:
 *   get:
 *     summary: Get transaction by hash
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: txHash
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{64}$'
 *         description: Transaction hash
 *     responses:
 *       200:
 *         description: Transaction details
 *       400:
 *         description: Invalid transaction hash
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Server error
 */
router.get('/transactions/:txHash',
    optionalAuthenticate,
    validateParams(txHashSchema),
    blockchainController.getTransactionByHash
);

/**
 * @swagger
 * /api/v1/blockchain/addresses/{address}/transactions:
 *   get:
 *     summary: Get transactions for an address
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Ethereum address
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
 *         description: Number of transactions per page
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [timestamp]
 *           default: timestamp
 *         description: Field to order by
 *       - in: query
 *         name: orderDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: List of transactions for the address
 *       400:
 *         description: Invalid address or query parameters
 *       500:
 *         description: Server error
 */
router.get('/addresses/:address/transactions',
    optionalAuthenticate,
    validateParams(addressSchema),
    validateQuery(paginationSchema),
    blockchainController.getAddressTransactions
);

/**
 * @swagger
 * /api/v1/blockchain/addresses/{address}:
 *   get:
 *     summary: Get address information
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Ethereum address
 *     responses:
 *       200:
 *         description: Address information including balance and transaction count
 *       400:
 *         description: Invalid address format
 *       500:
 *         description: Server error
 */
router.get('/addresses/:address',
    optionalAuthenticate,
    validateParams(addressSchema),
    blockchainController.getAddressInfo
);

/**
 * @swagger
 * /api/v1/blockchain/latest-block-number:
 *   get:
 *     summary: Get the latest block number
 *     tags: [Blockchain]
 *     responses:
 *       200:
 *         description: Latest block number
 *       500:
 *         description: Server error
 */
router.get('/latest-block-number',
    optionalAuthenticate,
    blockchainController.getLatestBlockNumber
);

/**
 * @swagger
 * /api/v1/blockchain/search:
 *   get:
 *     summary: Search blocks, transactions, and addresses
 *     tags: [Blockchain]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Search query (address, transaction hash, or block number)
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Invalid or missing search query
 *       500:
 *         description: Server error
 */
router.get('/search',
    optionalAuthenticate,
    validateQuery(searchSchema),
    blockchainController.search
);

export default router;