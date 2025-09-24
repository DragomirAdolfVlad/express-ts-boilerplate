/**
 * Blockchain routes - Version 1
 * Handles blockchain data queries and operations
 */

import { Router } from 'express';
import { BlockchainController } from '../../controllers/blockchain-controller';
import { 
    authenticate,
    requirePermissions,
    optionalAuthenticate
} from '../../../middleware/auth';
import { 
    validateParams,
    validateQuery,
    validateBody
} from '../../../middleware/validation';
import Joi from 'joi';

const router = Router();
const blockchainController = new BlockchainController();

// Validation schemas
const blockNumberSchema = Joi.object({
    blockNumber: Joi.string().pattern(/^\d+$/).required()
});

const txHashSchema = Joi.object({
    txHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required()
});

const addressSchema = Joi.object({
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const blocksQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    fromBlock: Joi.string().pattern(/^\d+$/).optional(),
    toBlock: Joi.string().pattern(/^\d+$/).optional()
});

const transactionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
    status: Joi.string().valid('PENDING', 'SUCCESS', 'FAILED', 'DROPPED').optional(),
    fromBlock: Joi.string().pattern(/^\d+$/).optional(),
    toBlock: Joi.string().pattern(/^\d+$/).optional()
});

const blockQuerySchema = Joi.object({
    includeTransactions: Joi.boolean().optional()
});

const transactionQuerySchema = Joi.object({
    includeLogs: Joi.boolean().optional()
});

const addMonitoringSchema = Joi.object({
    label: Joi.string().max(100).optional(),
    addressType: Joi.string().valid('EOA', 'CONTRACT', 'NAD_FUN').optional()
});

// =============================================================================
// BLOCK ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/blockchain/blocks
 * Get blocks with pagination and filtering
 * Optional authentication - some features require auth
 */
router.get('/blocks',
    optionalAuthenticate,
    validateQuery(blocksQuerySchema),
    blockchainController.getBlocks
);

/**
 * GET /api/v1/blockchain/blocks/:blockNumber
 * Get specific block by number
 * Optional authentication
 */
router.get('/blocks/:blockNumber',
    optionalAuthenticate,
    validateParams(blockNumberSchema),
    validateQuery(blockQuerySchema),
    blockchainController.getBlock
);

// =============================================================================
// TRANSACTION ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/blockchain/transactions
 * Get transactions with pagination and filtering
 * Optional authentication
 */
router.get('/transactions',
    optionalAuthenticate,
    validateQuery(transactionsQuerySchema),
    blockchainController.getTransactions
);

/**
 * GET /api/v1/blockchain/transactions/:txHash
 * Get specific transaction by hash
 * Optional authentication
 */
router.get('/transactions/:txHash',
    optionalAuthenticate,
    validateParams(txHashSchema),
    validateQuery(transactionQuerySchema),
    blockchainController.getTransaction
);

// =============================================================================
// ADDRESS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/blockchain/addresses/:address
 * Get address information and transaction history
 * Optional authentication
 */
router.get('/addresses/:address',
    optionalAuthenticate,
    validateParams(addressSchema),
    blockchainController.getAddress
);

/**
 * POST /api/v1/blockchain/addresses/:address/monitor
 * Add address to monitoring list
 * Requires authentication and monitoring permissions
 */
router.post('/addresses/:address/monitor',
    authenticate,
    requirePermissions('blockchain:monitor'),
    validateParams(addressSchema),
    validateBody(addMonitoringSchema),
    blockchainController.addAddressMonitoring
);

// =============================================================================
// SYNC STATUS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/blockchain/sync/status
 * Get blockchain synchronization status
 * Requires authentication and read permissions
 */
router.get('/sync/status',
    authenticate,
    requirePermissions('blockchain:read'),
    blockchainController.getSyncStatus
);

export default router;