/**
 * Blockchain controller for Monad blockchain API endpoints
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { BlockchainService } from '../../services/database/blockchain-service';
import { getContainer } from '../../services/di/container';
import { log } from '../../utils/logger';
import { ValidationError, NotFoundError } from '../../utils/errors';

export class BlockchainController extends BaseController {
    private blockchainService: BlockchainService;

    constructor() {
        super();
        this.blockchainService = getContainer().blockchainService;
    }

    /**
     * Get latest blocks with pagination
     * GET /api/v1/blockchain/blocks
     */
    getLatestBlocks = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Fetching latest blocks');

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderBy = (req.query.orderBy as string) || 'blockNumber';
            const orderDirection = (req.query.orderDirection as string) || 'desc';

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            if (!['blockNumber', 'timestamp'].includes(orderBy)) {
                throw new ValidationError('Invalid orderBy field', 'orderBy');
            }

            if (!['asc', 'desc'].includes(orderDirection)) {
                throw new ValidationError('Invalid orderDirection', 'orderDirection');
            }

            const result = await this.blockchainService.getLatestBlocks(
                { page, limit, orderBy: orderBy as any, orderDirection: orderDirection as any },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Latest blocks fetched successfully', {
                page,
                limit,
                total: result.total,
                returned: result.blocks.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                blocks: result.blocks,
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
     * Get block by number
     * GET /api/v1/blockchain/blocks/:blockNumber
     */
    getBlockByNumber = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const blockNumber = this.parseBigIntParam(req.params.blockNumber);
            const includeTransactions = req.query.includeTransactions === 'true';

            logger.info('Fetching block by number', {
                blockNumber: blockNumber.toString(),
                includeTransactions
            });

            const block = await this.blockchainService.getBlockByNumber(
                blockNumber,
                includeTransactions,
                { requestId: req.headers['x-request-id'] as string }
            );

            if (!block) {
                throw new NotFoundError('Block not found');
            }

            const duration = timer.end();
            logger.info('Block fetched successfully', {
                blockNumber: block.blockNumber.toString(),
                blockHash: block.blockHash,
                transactionCount: block.transactions?.length || 0,
                duration: `${duration}ms`
            });

            this.ok(res, { block });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get transaction by hash
     * GET /api/v1/blockchain/transactions/:txHash
     */
    getTransactionByHash = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const txHash = req.params.txHash;

            // Validate transaction hash format
            if (!this.isValidTxHash(txHash)) {
                throw new ValidationError('Invalid transaction hash format', 'txHash');
            }

            logger.info('Fetching transaction by hash', { txHash });

            const transaction = await this.blockchainService.getTransactionByHash(
                txHash,
                { requestId: req.headers['x-request-id'] as string }
            );

            if (!transaction) {
                throw new NotFoundError('Transaction not found');
            }

            const duration = timer.end();
            logger.info('Transaction fetched successfully', {
                txHash: transaction.txHash,
                blockNumber: transaction.blockNumber.toString(),
                status: transaction.status,
                duration: `${duration}ms`
            });

            this.ok(res, { transaction });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get transactions for an address
     * GET /api/v1/blockchain/addresses/:address/transactions
     */
    getAddressTransactions = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            const page = this.parseIntQuery(req.query.page as string, 1);
            const limit = this.parseIntQuery(req.query.limit as string, 20);
            const orderBy = (req.query.orderBy as string) || 'timestamp';
            const orderDirection = (req.query.orderDirection as string) || 'desc';

            // Validate parameters
            if (limit > 100) {
                throw new ValidationError('Limit cannot exceed 100', 'limit');
            }

            logger.info('Fetching address transactions', {
                address,
                page,
                limit
            });

            const result = await this.blockchainService.getAddressTransactions(
                address,
                { page, limit, orderBy: orderBy as any, orderDirection: orderDirection as any },
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address transactions fetched successfully', {
                address,
                page,
                limit,
                total: result.total,
                returned: result.transactions.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                address,
                transactions: result.transactions,
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
     * Get latest block number
     * GET /api/v1/blockchain/latest-block-number
     */
    getLatestBlockNumber = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Fetching latest block number');

            const latestBlockNumber = await this.blockchainService.getLatestBlockNumber(
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Latest block number fetched successfully', {
                latestBlockNumber: latestBlockNumber?.toString() || 'none',
                duration: `${duration}ms`
            });

            this.ok(res, {
                latestBlockNumber: latestBlockNumber?.toString() || null
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get address balance and info
     * GET /api/v1/blockchain/addresses/:address
     */
    getAddressInfo = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Fetching address info', { address });

            const addressInfo = await this.blockchainService.getOrCreateAddress(
                address,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address info fetched successfully', {
                address,
                balance: addressInfo.balance,
                transactionCount: addressInfo.transactionCount,
                duration: `${duration}ms`
            });

            this.ok(res, { address: addressInfo });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Search blocks and transactions
     * GET /api/v1/blockchain/search
     */
    search = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const query = req.query.q as string;

            if (!query) {
                throw new ValidationError('Search query is required', 'q');
            }

            logger.info('Searching blockchain data', { query });

            const results: any = {
                query,
                results: {
                    blocks: [],
                    transactions: [],
                    addresses: []
                }
            };

            // Try different search patterns
            if (this.isValidTxHash(query)) {
                // Search for transaction
                const transaction = await this.blockchainService.getTransactionByHash(
                    query,
                    { requestId: req.headers['x-request-id'] as string }
                );
                if (transaction) {
                    results.results.transactions.push(transaction);
                }
            } else if (this.isValidAddress(query)) {
                // Search for address
                const addressInfo = await this.blockchainService.getOrCreateAddress(
                    query,
                    { requestId: req.headers['x-request-id'] as string }
                );
                results.results.addresses.push(addressInfo);
            } else if (/^\d+$/.test(query)) {
                // Search for block by number
                const blockNumber = BigInt(query);
                const block = await this.blockchainService.getBlockByNumber(
                    blockNumber,
                    false,
                    { requestId: req.headers['x-request-id'] as string }
                );
                if (block) {
                    results.results.blocks.push(block);
                }
            }

            const duration = timer.end();
            const totalResults = results.results.blocks.length + 
                               results.results.transactions.length + 
                               results.results.addresses.length;

            logger.info('Search completed', {
                query,
                totalResults,
                duration: `${duration}ms`
            });

            this.ok(res, results);
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Helper method to validate transaction hash format
     */
    private isValidTxHash(hash: string): boolean {
        return /^0x[a-fA-F0-9]{64}$/.test(hash);
    }

    /**
     * Helper method to validate address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Helper method to parse BigInt parameter
     */
    private parseBigIntParam(param: string): bigint {
        try {
            return BigInt(param);
        } catch (error) {
            throw new ValidationError('Invalid number format', 'blockNumber');
        }
    }
}