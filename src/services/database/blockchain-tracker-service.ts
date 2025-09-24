/**
 * Blockchain Tracker Service
 * Handles blockchain data persistence and synchronization for Monad blockchain
 */

import { PrismaClient, Block, Transaction, MonitoredAddress, TransactionStatus, AddressType, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';
import { MonadBlock, MonadTransaction, MonadClientService } from '../blockchain/monad-client';

export interface CreateBlockData {
    blockNumber: bigint;
    blockHash: string;
    parentHash: string;
    timestamp: Date;
    gasLimit: bigint;
    gasUsed: bigint;
    baseFeePerGas?: bigint;
    difficulty?: bigint;
    totalDifficulty?: bigint;
    miner?: string;
    extraData?: string;
    size?: bigint;
    transactionCount: number;
}

export interface CreateTransactionData {
    txHash: string;
    blockNumber: bigint;
    blockHash: string;
    transactionIndex: number;
    fromAddress: string;
    toAddress?: string;
    value: string; // Wei amount as string
    gasPrice: bigint;
    gasLimit: bigint;
    gasUsed?: bigint;
    nonce: bigint;
    data?: string;
    status: TransactionStatus;
    timestamp: Date;
}

export interface SyncStatus {
    component: string;
    lastSyncedBlock: bigint;
    lastSyncedHash?: string;
    isHealthy: boolean;
    errorMessage?: string;
    lastSyncAt: Date;
}

export class BlockchainTrackerService extends HealthCheckableService {
    private prisma: PrismaClient;
    private monadClient: MonadClientService;

    constructor(prisma?: PrismaClient, monadClient?: MonadClientService) {
        super('BlockchainTrackerService');
        this.prisma = prisma || getPrismaClient();
        this.monadClient = monadClient || new MonadClientService();
    }

    /**
     * Store a new block in the database
     */
    async storeBlock(blockData: CreateBlockData, context?: LogContext): Promise<Block> {
        const logger = log.child(context || {});

        try {
            logger.info('Storing new block', { 
                blockNumber: blockData.blockNumber.toString(),
                blockHash: blockData.blockHash 
            });

            const block = await this.prisma.block.create({
                data: {
                    blockNumber: blockData.blockNumber,
                    blockHash: blockData.blockHash,
                    parentHash: blockData.parentHash,
                    timestamp: blockData.timestamp,
                    gasLimit: blockData.gasLimit,
                    gasUsed: blockData.gasUsed,
                    baseFeePerGas: blockData.baseFeePerGas,
                    difficulty: blockData.difficulty,
                    totalDifficulty: blockData.totalDifficulty,
                    miner: blockData.miner,
                    extraData: blockData.extraData,
                    size: blockData.size,
                    transactionCount: blockData.transactionCount
                }
            });

            logger.info('Block stored successfully', { 
                blockId: block.id,
                blockNumber: blockData.blockNumber.toString()
            });

            return block;

        } catch (error) {
            logger.error('Failed to store block', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to store block ${blockData.blockNumber}`,
                'create',
                'blocks',
                context
            );
        }
    }

    /**
     * Store a new transaction in the database
     */
    async storeTransaction(txData: CreateTransactionData, context?: LogContext): Promise<Transaction> {
        const logger = log.child(context || {});

        try {
            logger.debug('Storing new transaction', { 
                txHash: txData.txHash,
                blockNumber: txData.blockNumber.toString()
            });

            const transaction = await this.prisma.transaction.create({
                data: {
                    txHash: txData.txHash,
                    blockNumber: txData.blockNumber,
                    blockHash: txData.blockHash,
                    transactionIndex: txData.transactionIndex,
                    fromAddress: txData.fromAddress,
                    toAddress: txData.toAddress,
                    value: new Prisma.Decimal(txData.value),
                    gasPrice: txData.gasPrice,
                    gasLimit: txData.gasLimit,
                    gasUsed: txData.gasUsed,
                    nonce: txData.nonce,
                    data: txData.data,
                    status: txData.status,
                    timestamp: txData.timestamp
                }
            });

            logger.debug('Transaction stored successfully', { 
                transactionId: transaction.id,
                txHash: txData.txHash
            });

            return transaction;

        } catch (error) {
            logger.error('Failed to store transaction', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to store transaction ${txData.txHash}`,
                'create',
                'transactions',
                context
            );
        }
    }

    /**
     * Get the latest synchronized block number
     */
    async getLastSyncedBlock(component: string = 'blocks', context?: LogContext): Promise<bigint> {
        const logger = log.child(context || {});

        try {
            logger.debug('Getting last synced block', { component });

            const syncStatus = await this.prisma.syncStatus.findUnique({
                where: { component }
            });

            const lastBlock = syncStatus?.lastSyncedBlock || BigInt(0);
            
            logger.debug('Last synced block retrieved', { 
                component,
                lastBlock: lastBlock.toString()
            });

            return lastBlock;

        } catch (error) {
            logger.error('Failed to get last synced block', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to get last synced block for ${component}`,
                'findUnique',
                'sync_status',
                context
            );
        }
    }

    /**
     * Update sync status
     */
    async updateSyncStatus(status: SyncStatus, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            logger.debug('Updating sync status', { 
                component: status.component,
                lastSyncedBlock: status.lastSyncedBlock.toString()
            });

            await this.prisma.syncStatus.upsert({
                where: { component: status.component },
                update: {
                    lastSyncedBlock: status.lastSyncedBlock,
                    lastSyncedHash: status.lastSyncedHash,
                    isHealthy: status.isHealthy,
                    errorMessage: status.errorMessage,
                    lastSyncAt: status.lastSyncAt
                },
                create: {
                    component: status.component,
                    lastSyncedBlock: status.lastSyncedBlock,
                    lastSyncedHash: status.lastSyncedHash,
                    isHealthy: status.isHealthy,
                    errorMessage: status.errorMessage,
                    lastSyncAt: status.lastSyncAt
                }
            });

            logger.debug('Sync status updated successfully', { component: status.component });

        } catch (error) {
            logger.error('Failed to update sync status', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to update sync status for ${status.component}`,
                'upsert',
                'sync_status',
                context
            );
        }
    }

    /**
     * Add address to monitoring list
     */
    async addMonitoredAddress(
        address: string, 
        label?: string, 
        addressType: AddressType = AddressType.EOA,
        context?: LogContext
    ): Promise<MonitoredAddress> {
        const logger = log.child(context || {});

        try {
            logger.info('Adding monitored address', { address, label, addressType });

            // Get current balance from blockchain
            const balance = await this.monadClient.getBalance(address, undefined, context);

            const monitoredAddress = await this.prisma.monitoredAddress.create({
                data: {
                    address,
                    label,
                    addressType,
                    lastBalance: new Prisma.Decimal(balance.toString()),
                    lastChecked: new Date()
                }
            });

            // Store initial balance history
            await this.prisma.addressBalance.create({
                data: {
                    address,
                    balance: new Prisma.Decimal(balance.toString()),
                    blockNumber: await this.monadClient.getLatestBlockNumber(context),
                    timestamp: new Date()
                }
            });

            logger.info('Monitored address added successfully', { 
                addressId: monitoredAddress.id,
                address
            });

            return monitoredAddress;

        } catch (error) {
            logger.error('Failed to add monitored address', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to add monitored address ${address}`,
                'create',
                'monitored_addresses',
                context
            );
        }
    }

    /**
     * Get transactions for a specific address
     */
    async getAddressTransactions(
        address: string, 
        page: number = 1, 
        limit: number = 50,
        context?: LogContext
    ): Promise<{
        data: Transaction[];
        total: number;
        page: number;
        totalPages: number;
    }> {
        const logger = log.child(context || {});

        try {
            logger.debug('Getting transactions for address', { address, page, limit });

            const skip = (page - 1) * limit;

            const [transactions, total] = await Promise.all([
                this.prisma.transaction.findMany({
                    where: {
                        OR: [
                            { fromAddress: address },
                            { toAddress: address }
                        ]
                    },
                    orderBy: {
                        timestamp: 'desc'
                    },
                    skip,
                    take: limit
                }),
                this.prisma.transaction.count({
                    where: {
                        OR: [
                            { fromAddress: address },
                            { toAddress: address }
                        ]
                    }
                })
            ]);

            const totalPages = Math.ceil(total / limit);

            logger.debug('Address transactions retrieved', { 
                address,
                count: transactions.length,
                total,
                page,
                totalPages
            });

            return {
                data: transactions,
                total,
                page,
                totalPages
            };

        } catch (error) {
            logger.error('Failed to get address transactions', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(
                `Failed to get transactions for address ${address}`,
                'findMany',
                'transactions',
                context
            );
        }
    }

    /**
     * Synchronize blockchain data from a specific block range
     */
    async syncBlockRange(fromBlock: bigint, toBlock: bigint, context?: LogContext): Promise<number> {
        const logger = log.child(context || {});
        let syncedBlocks = 0;

        try {
            logger.info('Starting block range synchronization', { 
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString()
            });

            for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
                try {
                    // Get block from blockchain
                    const monadBlock = await this.monadClient.getBlockByNumber(blockNum, true, context);
                    
                    // Convert and store block
                    const blockData: CreateBlockData = {
                        blockNumber: BigInt(monadBlock.number),
                        blockHash: monadBlock.hash,
                        parentHash: monadBlock.parentHash,
                        timestamp: new Date(parseInt(monadBlock.timestamp) * 1000),
                        gasLimit: BigInt(monadBlock.gasLimit),
                        gasUsed: BigInt(monadBlock.gasUsed),
                        baseFeePerGas: monadBlock.baseFeePerGas ? BigInt(monadBlock.baseFeePerGas) : undefined,
                        difficulty: monadBlock.difficulty ? BigInt(monadBlock.difficulty) : undefined,
                        totalDifficulty: monadBlock.totalDifficulty ? BigInt(monadBlock.totalDifficulty) : undefined,
                        miner: monadBlock.miner,
                        extraData: monadBlock.extraData,
                        size: monadBlock.size ? BigInt(monadBlock.size) : undefined,
                        transactionCount: Array.isArray(monadBlock.transactions) ? monadBlock.transactions.length : 0
                    };

                    // Store block
                    await this.storeBlock(blockData, context);

                    // Store transactions if available
                    if (Array.isArray(monadBlock.transactions) && monadBlock.transactions.length > 0) {
                        for (const tx of monadBlock.transactions as MonadTransaction[]) {
                            const txData: CreateTransactionData = {
                                txHash: tx.hash,
                                blockNumber: BigInt(tx.blockNumber),
                                blockHash: tx.blockHash,
                                transactionIndex: parseInt(tx.transactionIndex),
                                fromAddress: tx.from,
                                toAddress: tx.to,
                                value: tx.value,
                                gasPrice: BigInt(tx.gasPrice),
                                gasLimit: BigInt(tx.gas),
                                gasUsed: tx.gasUsed ? BigInt(tx.gasUsed) : undefined,
                                nonce: BigInt(tx.nonce),
                                data: tx.input,
                                status: tx.status === '0x1' ? TransactionStatus.SUCCESS : 
                                       tx.status === '0x0' ? TransactionStatus.FAILED : 
                                       TransactionStatus.PENDING,
                                timestamp: new Date(parseInt(monadBlock.timestamp) * 1000)
                            };

                            await this.storeTransaction(txData, context);
                        }
                    }

                    syncedBlocks++;

                    // Update sync status every 10 blocks
                    if (syncedBlocks % 10 === 0) {
                        await this.updateSyncStatus({
                            component: 'blocks',
                            lastSyncedBlock: blockNum,
                            lastSyncedHash: monadBlock.hash,
                            isHealthy: true,
                            lastSyncAt: new Date()
                        }, context);
                    }

                } catch (error) {
                    logger.error('Failed to sync block', { 
                        blockNumber: blockNum.toString(),
                        error: error instanceof Error ? error.message : String(error)
                    });
                    
                    // Update sync status with error
                    await this.updateSyncStatus({
                        component: 'blocks',
                        lastSyncedBlock: blockNum - BigInt(1),
                        isHealthy: false,
                        errorMessage: error instanceof Error ? error.message : String(error),
                        lastSyncAt: new Date()
                    }, context);

                    throw error;
                }
            }

            // Final sync status update
            await this.updateSyncStatus({
                component: 'blocks',
                lastSyncedBlock: toBlock,
                isHealthy: true,
                lastSyncAt: new Date()
            }, context);

            logger.info('Block range synchronization completed', { 
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString(),
                syncedBlocks
            });

            return syncedBlocks;

        } catch (error) {
            logger.error('Block range synchronization failed', error instanceof Error ? error : new Error(String(error)));
            throw new InternalServerError(`Failed to sync block range: ${error}`);
        }
    }

    /**
     * Health check implementation
     */
    async checkHealth(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = log.child(context || {});
        const startTime = Date.now();

        try {
            logger.debug('Performing blockchain tracker health check');

            // Check database connectivity
            await this.prisma.$queryRaw`SELECT 1`;

            // Check if sync status is healthy
            const syncStatus = await this.prisma.syncStatus.findUnique({
                where: { component: 'blocks' }
            });

            const duration = Date.now() - startTime;
            const isHealthy = !syncStatus || (syncStatus.isHealthy && 
                (Date.now() - syncStatus.lastSyncAt.getTime()) < 5 * 60 * 1000); // 5 minutes

            logger.debug('Blockchain tracker health check completed', { 
                duration,
                isHealthy,
                lastSync: syncStatus?.lastSyncAt
            });

            return {
                service: this.serviceName,
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date(),
                details: {
                    databaseConnected: true,
                    lastSyncedBlock: syncStatus?.lastSyncedBlock?.toString(),
                    lastSyncAt: syncStatus?.lastSyncAt,
                    syncHealthy: syncStatus?.isHealthy,
                    responseTime: duration
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Blockchain tracker health check failed', error instanceof Error ? error : new Error(String(error)));

            return {
                service: this.serviceName,
                status: 'unhealthy',
                timestamp: new Date(),
                error: error instanceof Error ? error.message : String(error),
                details: {
                    databaseConnected: false,
                    responseTime: duration
                }
            };
        }
    }
}