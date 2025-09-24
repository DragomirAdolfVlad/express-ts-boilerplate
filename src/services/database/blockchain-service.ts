/**
 * Blockchain service for Monad blockchain interactions
 */

import { PrismaClient, Block, Transaction, Address, TransactionStatus, AddressRole, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

export interface CreateBlockData {
    blockNumber: bigint;
    blockHash: string;
    parentHash: string;
    timestamp: Date;
    gasLimit: bigint;
    gasUsed: bigint;
    difficulty?: string;
    totalDifficulty?: string;
    size?: bigint;
    miner?: string;
    extraData?: string;
    baseFeePerGas?: bigint;
}

export interface CreateTransactionData {
    txHash: string;
    blockNumber: bigint;
    transactionIndex: number;
    fromAddress: string;
    toAddress?: string;
    value: string;
    gasLimit: bigint;
    gasUsed?: bigint;
    gasPrice: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce: bigint;
    status: TransactionStatus;
    contractAddress?: string;
    input?: string;
    logs?: any[];
    timestamp: Date;
}

export interface BlockWithTransactions extends Block {
    transactions: Transaction[];
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
    orderBy?: 'blockNumber' | 'timestamp';
    orderDirection?: 'asc' | 'desc';
}

export class BlockchainService extends HealthCheckableService {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        super('BlockchainService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Create or update a block
     */
    async createOrUpdateBlock(
        blockData: CreateBlockData,
        context: LogContext = {}
    ): Promise<Block> {
        const timer = this.startTimer('createOrUpdateBlock');
        
        try {
            log.debug('Creating/updating block', {
                ...context,
                blockNumber: blockData.blockNumber.toString(),
                blockHash: blockData.blockHash
            });

            const block = await this.prisma.block.upsert({
                where: {
                    blockNumber: blockData.blockNumber
                },
                update: {
                    blockHash: blockData.blockHash,
                    parentHash: blockData.parentHash,
                    timestamp: blockData.timestamp,
                    gasLimit: blockData.gasLimit,
                    gasUsed: blockData.gasUsed,
                    difficulty: blockData.difficulty,
                    totalDifficulty: blockData.totalDifficulty,
                    size: blockData.size,
                    miner: blockData.miner,
                    extraData: blockData.extraData,
                    baseFeePerGas: blockData.baseFeePerGas,
                    updatedAt: new Date()
                },
                create: {
                    ...blockData,
                    transactionCount: 0
                }
            });

            const duration = timer.end();
            log.info('Block created/updated successfully', {
                ...context,
                blockId: block.id,
                blockNumber: block.blockNumber.toString(),
                duration: `${duration}ms`
            });

            return block;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createOrUpdateBlock', 'blocks', context);
        }
    }

    /**
     * Create a transaction
     */
    async createTransaction(
        transactionData: CreateTransactionData,
        context: LogContext = {}
    ): Promise<Transaction> {
        const timer = this.startTimer('createTransaction');
        
        try {
            log.debug('Creating transaction', {
                ...context,
                txHash: transactionData.txHash,
                blockNumber: transactionData.blockNumber.toString()
            });

            const transaction = await this.prisma.transaction.create({
                data: {
                    ...transactionData,
                    logs: transactionData.logs || []
                }
            });

            // Update block transaction count
            await this.prisma.block.update({
                where: { blockNumber: transactionData.blockNumber },
                data: {
                    transactionCount: {
                        increment: 1
                    }
                }
            });

            // Create address entries and relationships
            await this.createAddressRelationships(transaction, context);

            const duration = timer.end();
            log.info('Transaction created successfully', {
                ...context,
                transactionId: transaction.id,
                txHash: transaction.txHash,
                duration: `${duration}ms`
            });

            return transaction;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createTransaction', 'transactions', context);
        }
    }

    /**
     * Get block by number with transactions
     */
    async getBlockByNumber(
        blockNumber: bigint,
        includeTransactions: boolean = false,
        context: LogContext = {}
    ): Promise<BlockWithTransactions | null> {
        const timer = this.startTimer('getBlockByNumber');
        
        try {
            const block = await this.prisma.block.findUnique({
                where: { blockNumber },
                include: {
                    transactions: includeTransactions
                }
            }) as BlockWithTransactions | null;

            const duration = timer.end();
            log.debug('Block retrieved', {
                ...context,
                blockNumber: blockNumber.toString(),
                found: !!block,
                transactionCount: block?.transactions?.length || 0,
                duration: `${duration}ms`
            });

            return block;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getBlockByNumber', 'blocks', context);
        }
    }

    /**
     * Get transaction by hash
     */
    async getTransactionByHash(
        txHash: string,
        context: LogContext = {}
    ): Promise<Transaction | null> {
        const timer = this.startTimer('getTransactionByHash');
        
        try {
            const transaction = await this.prisma.transaction.findUnique({
                where: { txHash },
                include: {
                    block: true,
                    tokenTransfers: true
                }
            });

            const duration = timer.end();
            log.debug('Transaction retrieved', {
                ...context,
                txHash,
                found: !!transaction,
                duration: `${duration}ms`
            });

            return transaction;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTransactionByHash', 'transactions', context);
        }
    }

    /**
     * Get latest blocks with pagination
     */
    async getLatestBlocks(
        options: PaginationOptions = {},
        context: LogContext = {}
    ): Promise<{ blocks: Block[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getLatestBlocks');
        const { page = 1, limit = 20, orderBy = 'blockNumber', orderDirection = 'desc' } = options;
        const skip = (page - 1) * limit;
        
        try {
            const [blocks, total] = await Promise.all([
                this.prisma.block.findMany({
                    skip,
                    take: limit,
                    orderBy: {
                        [orderBy]: orderDirection
                    },
                    include: {
                        _count: {
                            select: { transactions: true }
                        }
                    }
                }),
                this.prisma.block.count()
            ]);

            const hasMore = skip + blocks.length < total;
            const duration = timer.end();

            log.debug('Latest blocks retrieved', {
                ...context,
                page,
                limit,
                total,
                returned: blocks.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { blocks, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getLatestBlocks', 'blocks', context);
        }
    }

    /**
     * Get transactions for an address
     */
    async getAddressTransactions(
        address: string,
        options: PaginationOptions = {},
        context: LogContext = {}
    ): Promise<{ transactions: Transaction[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getAddressTransactions');
        const { page = 1, limit = 20, orderBy = 'timestamp', orderDirection = 'desc' } = options;
        const skip = (page - 1) * limit;
        
        try {
            // First ensure the address exists
            const addressRecord = await this.getOrCreateAddress(address, context);

            const [transactions, total] = await Promise.all([
                this.prisma.transaction.findMany({
                    where: {
                        addresses: {
                            some: {
                                addressId: addressRecord.id
                            }
                        }
                    },
                    skip,
                    take: limit,
                    orderBy: {
                        [orderBy]: orderDirection
                    },
                    include: {
                        block: true,
                        tokenTransfers: true
                    }
                }),
                this.prisma.transaction.count({
                    where: {
                        addresses: {
                            some: {
                                addressId: addressRecord.id
                            }
                        }
                    }
                })
            ]);

            const hasMore = skip + transactions.length < total;
            const duration = timer.end();

            log.debug('Address transactions retrieved', {
                ...context,
                address,
                page,
                limit,
                total,
                returned: transactions.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { transactions, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getAddressTransactions', 'transactions', context);
        }
    }

    /**
     * Get or create an address record
     */
    async getOrCreateAddress(address: string, context: LogContext = {}): Promise<Address> {
        try {
            const addressRecord = await this.prisma.address.upsert({
                where: { address },
                update: {
                    lastSeenAt: new Date()
                },
                create: {
                    address,
                    balance: '0',
                    nonce: 0n,
                    isContract: false,
                    firstSeenAt: new Date(),
                    lastSeenAt: new Date(),
                    transactionCount: 0
                }
            });

            return addressRecord;
        } catch (error) {
            throw this.handleDatabaseError(error, 'getOrCreateAddress', 'addresses', context);
        }
    }

    /**
     * Update address balance
     */
    async updateAddressBalance(
        address: string,
        balance: string,
        context: LogContext = {}
    ): Promise<Address> {
        try {
            const addressRecord = await this.prisma.address.update({
                where: { address },
                data: {
                    balance,
                    lastSeenAt: new Date()
                }
            });

            log.debug('Address balance updated', {
                ...context,
                address,
                balance
            });

            return addressRecord;
        } catch (error) {
            throw this.handleDatabaseError(error, 'updateAddressBalance', 'addresses', context);
        }
    }

    /**
     * Create address relationships for a transaction
     */
    private async createAddressRelationships(
        transaction: Transaction,
        context: LogContext = {}
    ): Promise<void> {
        try {
            const relationships = [];

            // From address
            const fromAddress = await this.getOrCreateAddress(transaction.fromAddress, context);
            relationships.push({
                transactionId: transaction.id,
                addressId: fromAddress.id,
                role: AddressRole.FROM,
                value: transaction.value
            });

            // To address (if exists)
            if (transaction.toAddress) {
                const toAddress = await this.getOrCreateAddress(transaction.toAddress, context);
                relationships.push({
                    transactionId: transaction.id,
                    addressId: toAddress.id,
                    role: AddressRole.TO,
                    value: transaction.value
                });
            }

            // Contract address (if exists)
            if (transaction.contractAddress) {
                const contractAddress = await this.getOrCreateAddress(transaction.contractAddress, context);
                await this.prisma.address.update({
                    where: { id: contractAddress.id },
                    data: { isContract: true }
                });
                
                relationships.push({
                    transactionId: transaction.id,
                    addressId: contractAddress.id,
                    role: AddressRole.CONTRACT,
                    value: '0'
                });
            }

            // Create all relationships
            await this.prisma.transactionAddress.createMany({
                data: relationships,
                skipDuplicates: true
            });

            // Update transaction counts
            const addressIds = relationships.map(r => r.addressId);
            await this.prisma.address.updateMany({
                where: {
                    id: { in: addressIds }
                },
                data: {
                    transactionCount: {
                        increment: 1
                    },
                    lastSeenAt: new Date()
                }
            });

        } catch (error) {
            log.error('Failed to create address relationships', {
                ...context,
                transactionId: transaction.id,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Get the latest block number
     */
    async getLatestBlockNumber(context: LogContext = {}): Promise<bigint | null> {
        try {
            const latestBlock = await this.prisma.block.findFirst({
                orderBy: { blockNumber: 'desc' },
                select: { blockNumber: true }
            });

            return latestBlock?.blockNumber || null;
        } catch (error) {
            throw this.handleDatabaseError(error, 'getLatestBlockNumber', 'blocks', context);
        }
    }

    /**
     * Health check implementation
     */
    async performHealthCheck(): Promise<ServiceHealthCheck> {
        try {
            const latestBlock = await this.getLatestBlockNumber();
            const blockCount = await this.prisma.block.count();
            const transactionCount = await this.prisma.transaction.count();

            return {
                status: 'healthy',
                details: {
                    latestBlock: latestBlock?.toString() || 'none',
                    blockCount,
                    transactionCount,
                    database: 'connected'
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    database: 'disconnected'
                }
            };
        }
    }
}