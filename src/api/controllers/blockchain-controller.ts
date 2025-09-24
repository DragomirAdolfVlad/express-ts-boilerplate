/**
 * Blockchain Controller
 * Handles HTTP requests for blockchain data queries and operations
 */

import { Request, Response, NextFunction } from 'express';
import { BaseController } from './base-controller';
import { log } from '../../utils/logger';
import { Timer } from '../../utils/timer';
import { ValidationError, NotFoundError } from '../../utils/errors';
import { getService } from '../../services/di/container';
import { BlockchainTrackerService } from '../../services/database/blockchain-tracker-service';
import { MonadClientService } from '../../services/blockchain/monad-client';
import { NadFunService } from '../../services/blockchain/nad-fun-service';
import { BlockchainSyncService } from '../../services/blockchain/blockchain-sync-service';

export class BlockchainController extends BaseController {
    private blockchainTracker: BlockchainTrackerService;
    private monadClient: MonadClientService;
    private nadFunService: NadFunService;

    constructor() {
        super();
        this.blockchainTracker = getService<BlockchainTrackerService>('blockchainTrackerService');
        this.monadClient = getService<MonadClientService>('monadClientService');
        this.nadFunService = getService<NadFunService>('nadFunService');
    }

    /**
     * GET /api/v1/blockchain/blocks - Get blocks with pagination
     */
    getBlocks = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getBlocks'
        });

        logger.info('Getting blocks list');

        // Extract pagination and filters
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const fromBlock = req.query.fromBlock ? BigInt(req.query.fromBlock as string) : undefined;
        const toBlock = req.query.toBlock ? BigInt(req.query.toBlock as string) : undefined;

        // Build where clause
        const where: any = {};
        if (fromBlock !== undefined) {
            where.blockNumber = { gte: fromBlock };
        }
        if (toBlock !== undefined) {
            where.blockNumber = { ...where.blockNumber, lte: toBlock };
        }

        const skip = (page - 1) * limit;

        // Get blocks from database
        const [blocks, total] = await Promise.all([
            this.blockchainTracker.prisma.block.findMany({
                where,
                orderBy: { blockNumber: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    blockNumber: true,
                    blockHash: true,
                    parentHash: true,
                    timestamp: true,
                    gasLimit: true,
                    gasUsed: true,
                    baseFeePerGas: true,
                    miner: true,
                    transactionCount: true,
                    createdAt: true
                }
            }),
            this.blockchainTracker.prisma.block.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);
        const duration = timer.end();

        logger.info('Blocks retrieved successfully', {
            count: blocks.length,
            total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: blocks.map(block => ({
                ...block,
                blockNumber: block.blockNumber.toString(),
                gasLimit: block.gasLimit.toString(),
                gasUsed: block.gasUsed.toString(),
                baseFeePerGas: block.baseFeePerGas?.toString()
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
     * GET /api/v1/blockchain/blocks/:blockNumber - Get specific block
     */
    getBlock = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getBlock'
        });

        const blockNumber = BigInt(req.params.blockNumber);
        const includeTransactions = req.query.includeTransactions === 'true';

        logger.info('Getting block details', { blockNumber: blockNumber.toString(), includeTransactions });

        const block = await this.blockchainTracker.prisma.block.findUnique({
            where: { blockNumber },
            include: {
                transactions: includeTransactions ? {
                    select: {
                        id: true,
                        txHash: true,
                        transactionIndex: true,
                        fromAddress: true,
                        toAddress: true,
                        value: true,
                        gasPrice: true,
                        gasLimit: true,
                        gasUsed: true,
                        status: true,
                        timestamp: true
                    }
                } : false
            }
        });

        if (!block) {
            throw new NotFoundError(`Block ${blockNumber.toString()} not found`);
        }

        const duration = timer.end();
        logger.info('Block retrieved successfully', {
            blockNumber: blockNumber.toString(),
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                ...block,
                blockNumber: block.blockNumber.toString(),
                gasLimit: block.gasLimit.toString(),
                gasUsed: block.gasUsed.toString(),
                baseFeePerGas: block.baseFeePerGas?.toString(),
                totalDifficulty: block.totalDifficulty?.toString(),
                difficulty: block.difficulty?.toString(),
                size: block.size?.toString(),
                transactions: block.transactions?.map(tx => ({
                    ...tx,
                    value: tx.value.toString(),
                    gasPrice: tx.gasPrice.toString(),
                    gasLimit: tx.gasLimit.toString(),
                    gasUsed: tx.gasUsed?.toString(),
                    nonce: tx.nonce.toString()
                }))
            }
        });
    });

    /**
     * GET /api/v1/blockchain/transactions - Get transactions with pagination
     */
    getTransactions = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getTransactions'
        });

        logger.info('Getting transactions list');

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const address = req.query.address as string;
        const status = req.query.status as string;
        const fromBlock = req.query.fromBlock ? BigInt(req.query.fromBlock as string) : undefined;
        const toBlock = req.query.toBlock ? BigInt(req.query.toBlock as string) : undefined;

        // Build where clause
        const where: any = {};
        
        if (address) {
            where.OR = [
                { fromAddress: address.toLowerCase() },
                { toAddress: address.toLowerCase() }
            ];
        }

        if (status) {
            where.status = status;
        }

        if (fromBlock !== undefined) {
            where.blockNumber = { gte: fromBlock };
        }
        if (toBlock !== undefined) {
            where.blockNumber = { ...where.blockNumber, lte: toBlock };
        }

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            this.blockchainTracker.prisma.transaction.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    txHash: true,
                    blockNumber: true,
                    blockHash: true,
                    transactionIndex: true,
                    fromAddress: true,
                    toAddress: true,
                    value: true,
                    gasPrice: true,
                    gasLimit: true,
                    gasUsed: true,
                    nonce: true,
                    status: true,
                    timestamp: true
                }
            }),
            this.blockchainTracker.prisma.transaction.count({ where })
        ]);

        const totalPages = Math.ceil(total / limit);
        const duration = timer.end();

        logger.info('Transactions retrieved successfully', {
            count: transactions.length,
            total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: transactions.map(tx => ({
                ...tx,
                blockNumber: tx.blockNumber.toString(),
                value: tx.value.toString(),
                gasPrice: tx.gasPrice.toString(),
                gasLimit: tx.gasLimit.toString(),
                gasUsed: tx.gasUsed?.toString(),
                nonce: tx.nonce.toString()
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
     * GET /api/v1/blockchain/transactions/:txHash - Get specific transaction
     */
    getTransaction = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getTransaction'
        });

        const txHash = req.params.txHash;
        const includeLogs = req.query.includeLogs === 'true';

        logger.info('Getting transaction details', { txHash, includeLogs });

        const transaction = await this.blockchainTracker.prisma.transaction.findUnique({
            where: { txHash },
            include: {
                logs: includeLogs,
                nadFunEvents: true
            }
        });

        if (!transaction) {
            throw new NotFoundError(`Transaction ${txHash} not found`);
        }

        const duration = timer.end();
        logger.info('Transaction retrieved successfully', {
            txHash,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                ...transaction,
                blockNumber: transaction.blockNumber.toString(),
                value: transaction.value.toString(),
                gasPrice: transaction.gasPrice.toString(),
                gasLimit: transaction.gasLimit.toString(),
                gasUsed: transaction.gasUsed?.toString(),
                nonce: transaction.nonce.toString(),
                logs: transaction.logs?.map(log => ({
                    ...log,
                    blockNumber: log.blockNumber.toString()
                })),
                nadFunEvents: transaction.nadFunEvents?.map(event => ({
                    ...event,
                    blockNumber: event.blockNumber.toString(),
                    amount: event.amount?.toString(),
                    price: event.price?.toString()
                }))
            }
        });
    });

    /**
     * GET /api/v1/blockchain/addresses/:address - Get address information
     */
    getAddress = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getAddress'
        });

        const address = req.params.address.toLowerCase();
        logger.info('Getting address information', { address });

        // Get current balance from blockchain
        const currentBalance = await this.monadClient.getBalance(address);

        // Get address from monitored addresses
        const monitoredAddress = await this.blockchainTracker.prisma.monitoredAddress.findUnique({
            where: { address },
            include: {
                balanceHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 10
                }
            }
        });

        // Get transaction count
        const [sentCount, receivedCount] = await Promise.all([
            this.blockchainTracker.prisma.transaction.count({
                where: { fromAddress: address }
            }),
            this.blockchainTracker.prisma.transaction.count({
                where: { toAddress: address }
            })
        ]);

        const duration = timer.end();
        logger.info('Address information retrieved successfully', {
            address,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                address,
                currentBalance: currentBalance.toString(),
                isMonitored: !!monitoredAddress,
                label: monitoredAddress?.label,
                addressType: monitoredAddress?.addressType,
                transactionCounts: {
                    sent: sentCount,
                    received: receivedCount,
                    total: sentCount + receivedCount
                },
                balanceHistory: monitoredAddress?.balanceHistory?.map(history => ({
                    ...history,
                    balance: history.balance.toString(),
                    blockNumber: history.blockNumber.toString()
                })) || []
            }
        });
    });

    /**
     * POST /api/v1/blockchain/addresses/:address/monitor - Add address to monitoring
     */
    addAddressMonitoring = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'addAddressMonitoring'
        });

        const address = req.params.address.toLowerCase();
        const { label, addressType } = req.body;

        logger.info('Adding address to monitoring', { address, label, addressType });

        const monitoredAddress = await this.blockchainTracker.addMonitoredAddress(
            address,
            label,
            addressType,
            { requestId: req.headers['x-request-id'] as string }
        );

        const duration = timer.end();
        logger.info('Address monitoring added successfully', {
            address,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                ...monitoredAddress,
                lastBalance: monitoredAddress.lastBalance?.toString()
            }
        }, 201);
    });

    /**
     * GET /api/v1/blockchain/sync/status - Get synchronization status
     */
    getSyncStatus = this.asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
        const timer = new Timer();
        const logger = log.child({
            requestId: req.headers['x-request-id'] as string,
            controller: 'BlockchainController',
            action: 'getSyncStatus'
        });

        logger.info('Getting sync status');

        // Get sync status from database
        const syncStatuses = await this.blockchainTracker.prisma.syncStatus.findMany({
            orderBy: { component: 'asc' }
        });

        // Get latest block from blockchain
        const latestBlockchainBlock = await this.monadClient.getLatestBlockNumber();

        const duration = timer.end();
        logger.info('Sync status retrieved successfully', {
            duration: `${duration}ms`
        });

        this.success(res, {
            data: {
                latestBlockchainBlock: latestBlockchainBlock.toString(),
                components: syncStatuses.map(status => ({
                    ...status,
                    lastSyncedBlock: status.lastSyncedBlock.toString(),
                    blocksBehind: (latestBlockchainBlock - status.lastSyncedBlock).toString()
                }))
            }
        });
    });
}