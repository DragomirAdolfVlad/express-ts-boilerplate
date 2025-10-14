/**
 * TokensController - HTTP request handling for token endpoints
 * 
 * Handles all token-related HTTP requests including:
 * - Latest tokens listing
 * - Pre-bond tokens filtering
 * - Token existence checks
 * - Token overview with trades
 * - Trading data and bonding curve information
 * - Holder rankings
 * - Trader performance metrics
 * - Service statistics
 */

import { Request, Response } from 'express';
import { BaseController } from '../base-controller';
import { TokensService } from '../../../services/tokens/tokens.service';
import { HoldersService } from '../../../services/tokens/holders.service';
import { TradersService } from '../../../services/tokens/traders.service';
import { StatsService } from '../../../services/tokens/stats.service';
import { ValidationError, NotFoundError } from '../../../utils/errors';

/**
 * TokensController class extending BaseController
 * Requirements: 9
 */
export class TokensController extends BaseController {
  constructor(
    private readonly tokensService: TokensService,
    private readonly holdersService: HoldersService,
    private readonly tradersService: TradersService,
    private readonly statsService: StatsService
  ) {
    super('TokensController');
    console.log('[TokensController] Initialized with all service dependencies');
  }

  /**
   * GET /api/v1/tokens/latest - Get latest tokens with pagination
   * Requirements: 1, 9
   */
  public getLatestTokens = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    logger.info('Getting latest tokens');

    // Parse and validate query parameters
    const limit = this.validateLimit(req.query['limit'] as string | undefined);
    const offset = this.validateOffset(req.query['offset'] as string | undefined);

    logger.info('Pagination parameters', { limit, offset });

    // Call TokensService.getLatestTokens
    const result = await this.tokensService.getLatestTokens(limit, offset);

    // Format response with pagination metadata
    const duration = timer.end();
    logger.info('Latest tokens retrieved', {
      count: result.tokens.length,
      total: result.total,
      duration: `${duration}ms`
    });

    this.paginated(res, result.tokens, {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNext: result.hasNext,
      hasPrev: offset > 0
    });
  });

  /**
   * GET /api/v1/tokens/pre-bond - Get pre-bond tokens (curveProgress >= 65%)
   * Requirements: 2, 9
   */
  public getPreBondTokens = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    logger.info('Getting pre-bond tokens');

    // Parse and validate query parameters
    const limit = this.validateLimit(req.query['limit'] as string | undefined);
    const offset = this.validateOffset(req.query['offset'] as string | undefined);

    logger.info('Pagination parameters', { limit, offset });

    // Call TokensService.getPreBondTokens
    const result = await this.tokensService.getPreBondTokens(limit, offset);

    // Format response with pagination metadata
    const duration = timer.end();
    logger.info('Pre-bond tokens retrieved', {
      count: result.tokens.length,
      total: result.total,
      duration: `${duration}ms`
    });

    this.paginated(res, result.tokens, {
      page: Math.floor(offset / limit) + 1,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNext: result.hasNext,
      hasPrev: offset > 0
    });
  });

  /**
   * GET /api/v1/tokens/:tokenAddress/exists - Check if token exists
   * Requirements: 3, 9
   */
  public getTokenExists = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    // Extract and validate tokenAddress from params
    const tokenAddress = this.validateTokenAddress(req.params['tokenAddress']);

    logger.info('Checking token existence', { tokenAddress });

    // Call TokensService.tokenExists
    const exists = await this.tokensService.tokenExists(tokenAddress);

    // Return exists boolean with token address
    const duration = timer.end();
    logger.info('Token existence checked', {
      tokenAddress,
      exists,
      duration: `${duration}ms`
    });

    this.success(res, {
      exists,
      tokenAddress
    });
  });

  /**
   * GET /api/v1/tokens/:tokenAddress/overview - Get token overview with transactions
   * Requirements: 4, 9
   */
  public getTokenOverview = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    // Extract and validate tokenAddress from params
    const tokenAddress = this.validateTokenAddress(req.params['tokenAddress']);

    logger.info('Getting token overview', { tokenAddress });

    try {
      // Call TokensService.getTokenOverview
      const overview = await this.tokensService.getTokenOverview(tokenAddress);

      // Return overview and transactions
      const duration = timer.end();
      logger.info('Token overview retrieved', {
        tokenAddress,
        symbol: overview.token.symbol,
        transactionCount: overview.transactions.length,
        duration: `${duration}ms`
      });

      this.success(res, overview);

    } catch (error) {
      // Handle not found error
      if (error instanceof Error && error.message === 'Token not found') {
        logger.warn('Token not found', { tokenAddress });
        throw new NotFoundError(`Token not found: ${tokenAddress}`);
      }
      throw error;
    }
  });

  /**
   * GET /api/v1/tokens/:tokenAddress/trading-data - Get trading data and bonding curve info
   * Requirements: 7, 9
   */
  public getTradingData = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    // Extract and validate tokenAddress from params
    const tokenAddress = this.validateTokenAddress(req.params['tokenAddress']);

    logger.info('Getting trading data', { tokenAddress });

    try {
      // Call TokensService.getTradingData
      const tradingData = await this.tokensService.getTradingData(tokenAddress);

      // Return bonding curve information
      const duration = timer.end();
      logger.info('Trading data retrieved', {
        tokenAddress,
        currentPrice: tradingData.currentPrice,
        curveProgress: tradingData.curveProgress,
        duration: `${duration}ms`
      });

      this.success(res, tradingData);

    } catch (error) {
      // Handle not found error
      if (error instanceof Error && error.message === 'Token not found') {
        logger.warn('Token not found', { tokenAddress });
        throw new NotFoundError(`Token not found: ${tokenAddress}`);
      }
      throw error;
    }
  });

  /**
   * GET /api/v1/tokens/:tokenAddress/holders - Get token holders with rankings
   * Requirements: 5, 9
   */
  public getTokenHolders = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    // Extract and validate tokenAddress from params
    const tokenAddress = this.validateTokenAddress(req.params['tokenAddress']);

    logger.info('Getting token holders', { tokenAddress });

    try {
      // Call HoldersService.getTokenHolders
      const holders = await this.holdersService.getTokenHolders(tokenAddress);

      // Return holder rankings
      const duration = timer.end();
      logger.info('Token holders retrieved', {
        tokenAddress,
        holderCount: holders.length,
        duration: `${duration}ms`
      });

      this.success(res, holders);

    } catch (error) {
      // Handle not found error
      if (error instanceof Error && error.message === 'Failed to fetch token holders') {
        logger.warn('Holders not found', { tokenAddress });
        throw new NotFoundError(`Holders not found for token: ${tokenAddress}`);
      }
      throw error;
    }
  });

  /**
   * GET /api/v1/tokens/:tokenAddress/traders - Get token traders with rankings
   * Requirements: 6, 9
   */
  public getTokenTraders = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    // Extract and validate tokenAddress from params
    const tokenAddress = this.validateTokenAddress(req.params['tokenAddress']);

    logger.info('Getting token traders', { tokenAddress });

    try {
      // Call TradersService.getTokenTraders
      const traders = await this.tradersService.getTokenTraders(tokenAddress);

      // Return trader rankings
      const duration = timer.end();
      logger.info('Token traders retrieved', {
        tokenAddress,
        traderCount: traders.length,
        duration: `${duration}ms`
      });

      this.success(res, traders);

    } catch (error) {
      // Handle not found error
      if (error instanceof Error && error.message === 'Failed to fetch token traders') {
        logger.warn('Traders not found', { tokenAddress });
        throw new NotFoundError(`Traders not found for token: ${tokenAddress}`);
      }
      throw error;
    }
  });

  /**
   * GET /api/v1/tokens/stats - Get service statistics
   * Requirements: 8, 9
   */
  public getTokensStats = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const logger = this.createLogger(req);
    const timer = this.createTimer();

    logger.info('Getting service statistics');

    // Call StatsService.getServiceStats
    const stats = await this.statsService.getServiceStats();

    // Return service statistics
    const duration = timer.end();
    logger.info('Service statistics retrieved', {
      totalTokens: stats.totalTokens,
      totalTrades: stats.totalTrades,
      duration: `${duration}ms`
    });

    this.success(res, stats);
  });

  // ============================================================================
  // PRIVATE VALIDATION METHODS
  // ============================================================================

  /**
   * Validate limit parameter
   * Requirements: 1, 9
   */
  private validateLimit(limitParam: string | undefined): number {
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;

    if (!limitParam) {
      return DEFAULT_LIMIT;
    }

    const limit = parseInt(limitParam, 10);

    if (isNaN(limit) || limit <= 0) {
      throw new ValidationError('Invalid limit parameter: must be a positive integer', 'limit', limitParam);
    }

    // Cap at max limit
    return Math.min(limit, MAX_LIMIT);
  }

  /**
   * Validate offset parameter
   * Requirements: 1, 9
   */
  private validateOffset(offsetParam: string | undefined): number {
    const DEFAULT_OFFSET = 0;

    if (!offsetParam) {
      return DEFAULT_OFFSET;
    }

    const offset = parseInt(offsetParam, 10);

    if (isNaN(offset) || offset < 0) {
      throw new ValidationError('Invalid offset parameter: must be a non-negative integer', 'offset', offsetParam);
    }

    return offset;
  }

  /**
   * Validate token address parameter
   * Requirements: 3, 4, 5, 6, 7, 9
   */
  private validateTokenAddress(tokenAddress: string | undefined): string {
    if (!tokenAddress) {
      throw new ValidationError('Missing token address parameter', 'tokenAddress');
    }

    // Validate Ethereum address format (0x followed by 40 hex characters)
    const TOKEN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

    if (!TOKEN_ADDRESS_REGEX.test(tokenAddress)) {
      throw new ValidationError('Invalid token address format', 'tokenAddress', tokenAddress);
    }

    return tokenAddress;
  }
}
