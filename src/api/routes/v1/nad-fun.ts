/**
 * nad.fun routes - Version 1
 * Handles nad.fun program data and analytics
 */

import { Router } from 'express';
import { NadFunController } from '../../controllers/nad-fun-controller';
import { 
    authenticate,
    optionalAuthenticate,
    requirePermissions
} from '../../../middleware/auth';
import { 
    validateParams,
    validateQuery
} from '../../../middleware/validation';
import Joi from 'joi';

const router = Router();
const nadFunController = new NadFunController();

// Validation schemas
const tokenAddressSchema = Joi.object({
    tokenAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const userAddressSchema = Joi.object({
    userAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const tokensQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sortBy: Joi.string().valid('createdAt', 'marketCap', 'currentPrice', 'volume24h').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
    search: Joi.string().max(100).optional()
});

const priceHistoryQuerySchema = Joi.object({
    timeframe: Joi.string().valid('1h', '24h', '7d', '30d').optional(),
    limit: Joi.number().integer().min(1).max(1000).optional()
});

const eventsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    eventTypes: Joi.string().optional(), // Comma-separated list
    tokenAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional(),
    userAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional()
});

const tokenEventsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    eventTypes: Joi.string().optional() // Comma-separated list
});

const userActivityQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
});

// =============================================================================
// TOKEN ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/nad-fun/tokens
 * Get nad.fun tokens with market data
 * Public endpoint - no authentication required
 */
router.get('/tokens',
    validateQuery(tokensQuerySchema),
    nadFunController.getTokens
);

/**
 * GET /api/v1/nad-fun/tokens/:tokenAddress
 * Get specific nad.fun token details
 * Public endpoint - no authentication required
 */
router.get('/tokens/:tokenAddress',
    validateParams(tokenAddressSchema),
    nadFunController.getToken
);

/**
 * GET /api/v1/nad-fun/tokens/:tokenAddress/price-history
 * Get token price history
 * Public endpoint - no authentication required
 */
router.get('/tokens/:tokenAddress/price-history',
    validateParams(tokenAddressSchema),
    validateQuery(priceHistoryQuerySchema),
    nadFunController.getTokenPriceHistory
);

/**
 * GET /api/v1/nad-fun/tokens/:tokenAddress/events
 * Get events for specific token
 * Public endpoint - no authentication required
 */
router.get('/tokens/:tokenAddress/events',
    validateParams(tokenAddressSchema),
    validateQuery(tokenEventsQuerySchema),
    nadFunController.getTokenEvents
);

// =============================================================================
// EVENT ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/nad-fun/events
 * Get nad.fun events with filtering
 * Public endpoint - no authentication required
 */
router.get('/events',
    validateQuery(eventsQuerySchema),
    nadFunController.getEvents
);

// =============================================================================
// ANALYTICS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/nad-fun/analytics/overview
 * Get nad.fun analytics overview
 * Optional authentication - enhanced data for authenticated users
 */
router.get('/analytics/overview',
    optionalAuthenticate,
    nadFunController.getAnalyticsOverview
);

// =============================================================================
// USER ACTIVITY ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/nad-fun/users/:userAddress/activity
 * Get user activity and statistics
 * Optional authentication - enhanced data for authenticated users
 */
router.get('/users/:userAddress/activity',
    optionalAuthenticate,
    validateParams(userAddressSchema),
    validateQuery(userActivityQuerySchema),
    nadFunController.getUserActivity
);

export default router;