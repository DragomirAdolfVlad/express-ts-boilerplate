/**
 * Token API routes - Version 1
 * 
 * Provides endpoints for:
 * - Latest tokens listing
 * - Pre-bond tokens filtering
 * - Token existence checks
 * - Token overview with trades
 * - Trading data and bonding curve information
 * - Holder rankings
 * - Trader performance metrics
 * - Service statistics
 * 
 * Requirements: 1-8
 */

import { Router } from 'express';
import { TokensController } from '../../controllers/tokens/tokens-controller';
import { TokensService } from '../../../services/tokens/tokens.service';
import { HoldersService } from '../../../services/tokens/holders.service';
import { TradersService } from '../../../services/tokens/traders.service';
import { StatsService } from '../../../services/tokens/stats.service';
import { MonadTokenRepositoryImpl } from '../../../infrastructure/database/monad-token.repository';
import { redisTrackerCache } from '../../../services/redis/tracker-cache.service';
import { getPrismaClient } from '../../../services/database/database';
import { validateTokenAddress, validatePagination } from '../../validators/tokens.validator';

const router = Router();

// Initialize dependencies
const prisma = getPrismaClient();
const repository = new MonadTokenRepositoryImpl(prisma);
const cache = redisTrackerCache;

// Note: MonadTrackerMain is a singleton managed by app.ts
// We'll pass null for now and update StatsService to handle optional tracker
const tokensService = new TokensService(repository, cache);
const holdersService = new HoldersService(repository, cache);
const tradersService = new TradersService(repository, cache);
const statsService = new StatsService(repository, cache, null as any);

// Initialize controller
const tokensController = new TokensController(
    tokensService,
    holdersService,
    tradersService,
    statsService
);

// ============================================================================
// TOKEN LISTING ENDPOINTS
// ============================================================================

/**
 * GET /tokens/latest - Get latest tokens with pagination
 * Requirements: 1, 9
 * 
 * Query Parameters:
 * - limit: number (optional, default: 50, max: 100)
 * - offset: number (optional, default: 0)
 * 
 * Response: Paginated list of tokens ordered by creation timestamp (newest first)
 */
router.get('/latest', validatePagination, tokensController.getLatestTokens);

/**
 * GET /tokens/pre-bond - Get pre-bond tokens (curveProgress >= 65%)
 * Requirements: 2, 9
 * 
 * Query Parameters:
 * - limit: number (optional, default: 50, max: 100)
 * - offset: number (optional, default: 0)
 * 
 * Response: Paginated list of tokens approaching bonding curve completion
 */
router.get('/pre-bond', validatePagination, tokensController.getPreBondTokens);

/**
 * GET /tokens/stats - Get service statistics
 * Requirements: 8, 9
 * 
 * Response: Service statistics including total tokens, trades, volume, and cache metrics
 */
router.get('/stats', tokensController.getTokensStats);

// ============================================================================
// TOKEN DETAIL ENDPOINTS
// ============================================================================

/**
 * GET /tokens/:tokenAddress/exists - Check if token exists
 * Requirements: 3, 9
 * 
 * Path Parameters:
 * - tokenAddress: string (Ethereum address format: 0x followed by 40 hex characters)
 * 
 * Response: { exists: boolean, tokenAddress: string }
 */
router.get('/:tokenAddress/exists', validateTokenAddress, tokensController.getTokenExists);

/**
 * GET /tokens/:tokenAddress/overview - Get token overview with transactions
 * Requirements: 4, 9
 * 
 * Path Parameters:
 * - tokenAddress: string (Ethereum address format)
 * 
 * Response: Token overview including metadata, stats, and recent transactions (last 100)
 */
router.get('/:tokenAddress/overview', validateTokenAddress, tokensController.getTokenOverview);

/**
 * GET /tokens/:tokenAddress/trading-data - Get trading data and bonding curve info
 * Requirements: 7, 9
 * 
 * Path Parameters:
 * - tokenAddress: string (Ethereum address format)
 * 
 * Response: Bonding curve information including reserves, progress, and current price
 */
router.get('/:tokenAddress/trading-data', validateTokenAddress, tokensController.getTradingData);

// ============================================================================
// HOLDER AND TRADER ENDPOINTS
// ============================================================================

/**
 * GET /tokens/:tokenAddress/holders - Get token holders with rankings
 * Requirements: 5, 9
 * 
 * Path Parameters:
 * - tokenAddress: string (Ethereum address format)
 * 
 * Response: Ranked list of holders with balances, PnL, and trading activity
 */
router.get('/:tokenAddress/holders', validateTokenAddress, tokensController.getTokenHolders);

/**
 * GET /tokens/:tokenAddress/traders - Get token traders with rankings
 * Requirements: 6, 9
 * 
 * Path Parameters:
 * - tokenAddress: string (Ethereum address format)
 * 
 * Response: Ranked list of traders with performance metrics and win rates
 */
router.get('/:tokenAddress/traders', validateTokenAddress, tokensController.getTokenTraders);

export default router;
