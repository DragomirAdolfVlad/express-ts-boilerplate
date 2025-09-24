/**
 * Token tracking controller for ERC-20 and other token standards
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { TokenTrackingService } from '../../services/database/token-tracking-service';
import { getContainer } from '../../services/di/container';
import { log } from '../../utils/logger';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { TokenType } from '@prisma/client';

export class TokenTrackingController extends BaseController {
    private tokenTrackingService: TokenTrackingService;

    constructor() {
        super();
        this.tokenTrackingService = getContainer().tokenTrackingService;
    }

    /**
     * Get tokens with pagination and filtering
     * GET /api/v1/tokens
     */
    getTokens = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Fetching tokens');

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderBy = (req.query.orderBy as string) || 'createdAt';
            const orderDirection = (req.query.orderDirection as string) || 'desc';
            const search = req.query.search as string;
            const tokenType = req.query.tokenType as TokenType;
            const verified = req.query.verified === 'true' ? true : 
                             req.query.verified === 'false' ? false : undefined;

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['name', 'symbol', 'createdAt'].includes(orderBy)) {
                throw new ValidationError('Invalid orderBy field', 'orderBy');
            }

            if (!['asc', 'desc'].includes(orderDirection)) {
                throw new ValidationError('Invalid orderDirection', 'orderDirection');
            }

            if (tokenType && !Object.values(TokenType).includes(tokenType)) {
                throw new ValidationError('Invalid token type', 'tokenType');
            }

            const result = await this.tokenTrackingService.getTokens(
                {
                    page,
                    limit,
                    orderBy: orderBy as any,
                    orderDirection: orderDirection as any,
                    search,
                    tokenType,
                    verified
                },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Tokens fetched successfully', {
                page,
                limit,
                total: result.total,
                returned: result.tokens.length,
                filters: { search, tokenType, verified },
                duration: `${duration}ms`
            });

            this.ok(res, {
                tokens: result.tokens,
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
     * Get token by contract address
     * GET /api/v1/tokens/:contractAddress
     */
    getTokenByAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const contractAddress = req.params.contractAddress;

            // Validate contract address format
            if (!this.isValidAddress(contractAddress)) {
                throw new ValidationError('Invalid contract address format', 'contractAddress');
            }

            logger.info('Fetching token by address', { contractAddress });

            const token = await this.tokenTrackingService.getTokenByAddress(
                contractAddress.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            if (!token) {
                throw new NotFoundError('Token not found');
            }

            const duration = timer.end();
            logger.info('Token fetched successfully', {
                contractAddress,
                symbol: token.symbol,
                name: token.name,
                duration: `${duration}ms`
            });

            this.ok(res, { token });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get token transfers for a specific token
     * GET /api/v1/tokens/:contractAddress/transfers
     */
    getTokenTransfers = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const contractAddress = req.params.contractAddress;

            // Validate contract address format
            if (!this.isValidAddress(contractAddress)) {
                throw new ValidationError('Invalid contract address format', 'contractAddress');
            }

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderDirection = (req.query.orderDirection as string) || 'desc';

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['asc', 'desc'].includes(orderDirection)) {
                throw new ValidationError('Invalid orderDirection', 'orderDirection');
            }

            logger.info('Fetching token transfers', {
                contractAddress,
                page,
                limit
            });

            const result = await this.tokenTrackingService.getTokenTransfers(
                contractAddress.toLowerCase(),
                { page, limit, orderDirection: orderDirection as any },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Token transfers fetched successfully', {
                contractAddress,
                page,
                limit,
                total: result.total,
                returned: result.transfers.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                contractAddress,
                transfers: result.transfers,
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
     * Get token balance for an address
     * GET /api/v1/tokens/:contractAddress/balances/:address
     */
    getTokenBalance = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const contractAddress = req.params.contractAddress;
            const address = req.params.address;

            // Validate addresses
            if (!this.isValidAddress(contractAddress)) {
                throw new ValidationError('Invalid contract address format', 'contractAddress');
            }

            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Fetching token balance', {
                contractAddress,
                address
            });

            const balance = await this.tokenTrackingService.getTokenBalance(
                contractAddress.toLowerCase(),
                address.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Token balance fetched successfully', {
                contractAddress,
                address,
                balance: balance?.balance || '0',
                duration: `${duration}ms`
            });

            this.ok(res, {
                contractAddress,
                address,
                balance: balance?.balance || '0',
                token: balance?.token || null,
                lastUpdated: balance?.updatedAt || null
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get all token balances for an address
     * GET /api/v1/addresses/:address/token-balances
     */
    getAddressTokenBalances = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Fetching address token balances', { address });

            const balances = await this.tokenTrackingService.getAddressTokenBalances(
                address.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address token balances fetched successfully', {
                address,
                count: balances.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                address,
                balances,
                count: balances.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get top tokens by various metrics
     * GET /api/v1/tokens/top
     */
    getTopTokens = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const sortBy = (req.query.sortBy as string) || 'volume';
            const limit = this.parseIntQuery(req.query.limit as string, 50);

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['volume', 'holders', 'transfers'].includes(sortBy)) {
                throw new ValidationError('Invalid sortBy field', 'sortBy');
            }

            logger.info('Fetching top tokens', {
                sortBy,
                limit
            });

            const topTokens = await this.tokenTrackingService.getTopTokens(
                sortBy as any,
                limit,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Top tokens fetched successfully', {
                sortBy,
                limit,
                returned: topTokens.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                sortBy,
                limit,
                tokens: topTokens,
                count: topTokens.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Create or update a token (admin endpoint)
     * POST /api/v1/tokens
     */
    createOrUpdateToken = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Creating/updating token');

            // Validate required fields
            this.validateRequired(req.body, ['contractAddress', 'name', 'symbol', 'decimals']);

            const {
                contractAddress,
                name,
                symbol,
                decimals,
                totalSupply,
                tokenType,
                logoUrl,
                website,
                description,
                isVerified
            } = req.body;

            // Validate contract address format
            if (!this.isValidAddress(contractAddress)) {
                throw new ValidationError('Invalid contract address format', 'contractAddress');
            }

            // Validate decimals
            if (typeof decimals !== 'number' || decimals < 0 || decimals > 18) {
                throw new ValidationError('Decimals must be a number between 0 and 18', 'decimals');
            }

            // Validate token type if provided
            if (tokenType && !Object.values(TokenType).includes(tokenType)) {
                throw new ValidationError('Invalid token type', 'tokenType');
            }

            const tokenData = {
                contractAddress: contractAddress.toLowerCase(),
                name: name.trim(),
                symbol: symbol.trim().toUpperCase(),
                decimals,
                totalSupply: totalSupply?.toString(),
                tokenType: tokenType || TokenType.ERC20,
                logoUrl,
                website,
                description,
                isVerified: isVerified || false
            };

            const token = await this.tokenTrackingService.createOrUpdateToken(
                tokenData,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Token created/updated successfully', {
                tokenId: token.id,
                contractAddress: token.contractAddress,
                symbol: token.symbol,
                duration: `${duration}ms`
            });

            this.created(res, { token });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Search tokens
     * GET /api/v1/tokens/search
     */
    searchTokens = async (req: Request, res: Response): Promise<void> => {
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

            logger.info('Searching tokens', { query, limit });

            const result = await this.tokenTrackingService.getTokens(
                {
                    page: 1,
                    limit,
                    search: query,
                    orderBy: 'name',
                    orderDirection: 'asc'
                },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Token search completed', {
                query,
                returned: result.tokens.length,
                total: result.total,
                duration: `${duration}ms`
            });

            this.ok(res, {
                query,
                tokens: result.tokens,
                count: result.tokens.length,
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
}