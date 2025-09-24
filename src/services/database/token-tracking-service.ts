/**
 * Token tracking service for ERC-20 and other token standards
 */

import { PrismaClient, Token, TokenTransfer, TokenBalance, TokenType, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

export interface CreateTokenData {
    contractAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply?: string;
    tokenType?: TokenType;
    logoUrl?: string;
    website?: string;
    description?: string;
    isVerified?: boolean;
}

export interface CreateTokenTransferData {
    transactionId: string;
    tokenId: string;
    fromAddress: string;
    toAddress: string;
    amount: string;
    logIndex: number;
}

export interface TokenWithStats extends Token {
    transferCount: number;
    holderCount: number;
    totalVolume: string;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
    orderBy?: 'name' | 'symbol' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
}

export class TokenTrackingService extends HealthCheckableService {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        super('TokenTrackingService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Create or update a token
     */
    async createOrUpdateToken(
        tokenData: CreateTokenData,
        context: LogContext = {}
    ): Promise<Token> {
        const timer = this.startTimer('createOrUpdateToken');
        
        try {
            log.debug('Creating/updating token', {
                ...context,
                contractAddress: tokenData.contractAddress,
                symbol: tokenData.symbol
            });

            // Validate contract address format
            if (!this.isValidAddress(tokenData.contractAddress)) {
                throw new ValidationError('Invalid contract address format', 'contractAddress');
            }

            const token = await this.prisma.token.upsert({
                where: {
                    contractAddress: tokenData.contractAddress
                },
                update: {
                    name: tokenData.name,
                    symbol: tokenData.symbol,
                    decimals: tokenData.decimals,
                    totalSupply: tokenData.totalSupply,
                    tokenType: tokenData.tokenType || TokenType.ERC20,
                    logoUrl: tokenData.logoUrl,
                    website: tokenData.website,
                    description: tokenData.description,
                    isVerified: tokenData.isVerified || false,
                    updatedAt: new Date()
                },
                create: {
                    ...tokenData,
                    tokenType: tokenData.tokenType || TokenType.ERC20,
                    isVerified: tokenData.isVerified || false
                }
            });

            const duration = timer.end();
            log.info('Token created/updated successfully', {
                ...context,
                tokenId: token.id,
                contractAddress: token.contractAddress,
                symbol: token.symbol,
                duration: `${duration}ms`
            });

            return token;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createOrUpdateToken', 'tokens', context);
        }
    }

    /**
     * Create a token transfer
     */
    async createTokenTransfer(
        transferData: CreateTokenTransferData,
        context: LogContext = {}
    ): Promise<TokenTransfer> {
        const timer = this.startTimer('createTokenTransfer');
        
        try {
            log.debug('Creating token transfer', {
                ...context,
                tokenId: transferData.tokenId,
                fromAddress: transferData.fromAddress,
                toAddress: transferData.toAddress,
                amount: transferData.amount
            });

            const transfer = await this.prisma.tokenTransfer.create({
                data: transferData,
                include: {
                    token: true,
                    transaction: true
                }
            });

            // Update token balances
            await this.updateTokenBalances(
                transferData.tokenId,
                transferData.fromAddress,
                transferData.toAddress,
                transferData.amount,
                context
            );

            const duration = timer.end();
            log.info('Token transfer created successfully', {
                ...context,
                transferId: transfer.id,
                tokenSymbol: transfer.token.symbol,
                amount: transferData.amount,
                duration: `${duration}ms`
            });

            return transfer;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'createTokenTransfer', 'token_transfers', context);
        }
    }

    /**
     * Get token by contract address
     */
    async getTokenByAddress(
        contractAddress: string,
        context: LogContext = {}
    ): Promise<Token | null> {
        const timer = this.startTimer('getTokenByAddress');
        
        try {
            const token = await this.prisma.token.findUnique({
                where: { contractAddress },
                include: {
                    _count: {
                        select: {
                            transfers: true,
                            balances: true
                        }
                    }
                }
            });

            const duration = timer.end();
            log.debug('Token retrieved by address', {
                ...context,
                contractAddress,
                found: !!token,
                duration: `${duration}ms`
            });

            return token;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTokenByAddress', 'tokens', context);
        }
    }

    /**
     * Get tokens with pagination and filtering
     */
    async getTokens(
        options: PaginationOptions & {
            search?: string;
            tokenType?: TokenType;
            verified?: boolean;
        } = {},
        context: LogContext = {}
    ): Promise<{ tokens: TokenWithStats[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getTokens');
        const { 
            page = 1, 
            limit = 20, 
            orderBy = 'createdAt', 
            orderDirection = 'desc',
            search,
            tokenType,
            verified
        } = options;
        const skip = (page - 1) * limit;
        
        try {
            const where: Prisma.TokenWhereInput = {};

            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { symbol: { contains: search, mode: 'insensitive' } },
                    { contractAddress: { contains: search, mode: 'insensitive' } }
                ];
            }

            if (tokenType) {
                where.tokenType = tokenType;
            }

            if (verified !== undefined) {
                where.isVerified = verified;
            }

            const [tokens, total] = await Promise.all([
                this.prisma.token.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        [orderBy]: orderDirection
                    },
                    include: {
                        _count: {
                            select: {
                                transfers: true,
                                balances: true
                            }
                        }
                    }
                }),
                this.prisma.token.count({ where })
            ]);

            // Add stats to tokens
            const tokensWithStats: TokenWithStats[] = await Promise.all(
                tokens.map(async (token) => {
                    const totalVolume = await this.calculateTokenVolume(token.id);
                    return {
                        ...token,
                        transferCount: token._count.transfers,
                        holderCount: token._count.balances,
                        totalVolume
                    };
                })
            );

            const hasMore = skip + tokens.length < total;
            const duration = timer.end();

            log.debug('Tokens retrieved', {
                ...context,
                page,
                limit,
                total,
                returned: tokens.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { tokens: tokensWithStats, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTokens', 'tokens', context);
        }
    }

    /**
     * Get token transfers for a specific token
     */
    async getTokenTransfers(
        contractAddress: string,
        options: PaginationOptions = {},
        context: LogContext = {}
    ): Promise<{ transfers: TokenTransfer[]; total: number; hasMore: boolean }> {
        const timer = this.startTimer('getTokenTransfers');
        const { page = 1, limit = 20, orderDirection = 'desc' } = options;
        const skip = (page - 1) * limit;
        
        try {
            const token = await this.prisma.token.findUnique({
                where: { contractAddress }
            });

            if (!token) {
                throw new NotFoundError('Token not found');
            }

            const [transfers, total] = await Promise.all([
                this.prisma.tokenTransfer.findMany({
                    where: { tokenId: token.id },
                    skip,
                    take: limit,
                    orderBy: { createdAt: orderDirection },
                    include: {
                        token: true,
                        transaction: {
                            include: {
                                block: true
                            }
                        }
                    }
                }),
                this.prisma.tokenTransfer.count({
                    where: { tokenId: token.id }
                })
            ]);

            const hasMore = skip + transfers.length < total;
            const duration = timer.end();

            log.debug('Token transfers retrieved', {
                ...context,
                contractAddress,
                page,
                limit,
                total,
                returned: transfers.length,
                hasMore,
                duration: `${duration}ms`
            });

            return { transfers, total, hasMore };
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTokenTransfers', 'token_transfers', context);
        }
    }

    /**
     * Get token balance for an address
     */
    async getTokenBalance(
        contractAddress: string,
        address: string,
        context: LogContext = {}
    ): Promise<TokenBalance | null> {
        const timer = this.startTimer('getTokenBalance');
        
        try {
            const token = await this.prisma.token.findUnique({
                where: { contractAddress }
            });

            if (!token) {
                throw new NotFoundError('Token not found');
            }

            const addressRecord = await this.prisma.address.findUnique({
                where: { address }
            });

            if (!addressRecord) {
                return null;
            }

            const balance = await this.prisma.tokenBalance.findUnique({
                where: {
                    addressId_tokenId: {
                        addressId: addressRecord.id,
                        tokenId: token.id
                    }
                },
                include: {
                    token: true,
                    address: true
                }
            });

            const duration = timer.end();
            log.debug('Token balance retrieved', {
                ...context,
                contractAddress,
                address,
                balance: balance?.balance || '0',
                duration: `${duration}ms`
            });

            return balance;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTokenBalance', 'token_balances', context);
        }
    }

    /**
     * Get all token balances for an address
     */
    async getAddressTokenBalances(
        address: string,
        context: LogContext = {}
    ): Promise<TokenBalance[]> {
        const timer = this.startTimer('getAddressTokenBalances');
        
        try {
            const addressRecord = await this.prisma.address.findUnique({
                where: { address }
            });

            if (!addressRecord) {
                return [];
            }

            const balances = await this.prisma.tokenBalance.findMany({
                where: {
                    addressId: addressRecord.id,
                    balance: {
                        not: '0'
                    }
                },
                include: {
                    token: true,
                    address: true
                },
                orderBy: {
                    token: {
                        symbol: 'asc'
                    }
                }
            });

            const duration = timer.end();
            log.debug('Address token balances retrieved', {
                ...context,
                address,
                count: balances.length,
                duration: `${duration}ms`
            });

            return balances;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getAddressTokenBalances', 'token_balances', context);
        }
    }

    /**
     * Update token balances based on transfer
     */
    private async updateTokenBalances(
        tokenId: string,
        fromAddress: string,
        toAddress: string,
        amount: string,
        context: LogContext = {}
    ): Promise<void> {
        try {
            // Get or create address records
            const [fromAddressRecord, toAddressRecord] = await Promise.all([
                this.prisma.address.upsert({
                    where: { address: fromAddress },
                    update: { lastSeenAt: new Date() },
                    create: {
                        address: fromAddress,
                        balance: '0',
                        nonce: 0n,
                        isContract: false,
                        firstSeenAt: new Date(),
                        lastSeenAt: new Date(),
                        transactionCount: 0
                    }
                }),
                this.prisma.address.upsert({
                    where: { address: toAddress },
                    update: { lastSeenAt: new Date() },
                    create: {
                        address: toAddress,
                        balance: '0',
                        nonce: 0n,
                        isContract: false,
                        firstSeenAt: new Date(),
                        lastSeenAt: new Date(),
                        transactionCount: 0
                    }
                })
            ]);

            // Update balances (simplified - in production you'd need proper big number math)
            if (fromAddress !== '0x0000000000000000000000000000000000000000') {
                await this.prisma.tokenBalance.upsert({
                    where: {
                        addressId_tokenId: {
                            addressId: fromAddressRecord.id,
                            tokenId
                        }
                    },
                    update: {
                        balance: {
                            decrement: BigInt(amount)
                        }
                    },
                    create: {
                        addressId: fromAddressRecord.id,
                        tokenId,
                        balance: `-${amount}`
                    }
                });
            }

            await this.prisma.tokenBalance.upsert({
                where: {
                    addressId_tokenId: {
                        addressId: toAddressRecord.id,
                        tokenId
                    }
                },
                update: {
                    balance: {
                        increment: BigInt(amount)
                    }
                },
                create: {
                    addressId: toAddressRecord.id,
                    tokenId,
                    balance: amount
                }
            });

        } catch (error) {
            log.error('Failed to update token balances', {
                ...context,
                tokenId,
                fromAddress,
                toAddress,
                amount,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Calculate total volume for a token
     */
    private async calculateTokenVolume(tokenId: string): Promise<string> {
        try {
            const result = await this.prisma.tokenTransfer.aggregate({
                where: { tokenId },
                _sum: {
                    amount: true
                }
            });

            return result._sum.amount?.toString() || '0';
        } catch (error) {
            log.error('Failed to calculate token volume', {
                tokenId,
                error: error instanceof Error ? error.message : String(error)
            });
            return '0';
        }
    }

    /**
     * Validate Ethereum address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Get top tokens by volume or market cap
     */
    async getTopTokens(
        sortBy: 'volume' | 'holders' | 'transfers' = 'volume',
        limit: number = 50,
        context: LogContext = {}
    ): Promise<TokenWithStats[]> {
        const timer = this.startTimer('getTopTokens');
        
        try {
            let orderBy: Prisma.TokenOrderByWithRelationInput;

            switch (sortBy) {
                case 'holders':
                    orderBy = {
                        balances: {
                            _count: 'desc'
                        }
                    };
                    break;
                case 'transfers':
                    orderBy = {
                        transfers: {
                            _count: 'desc'
                        }
                    };
                    break;
                default:
                    orderBy = { createdAt: 'desc' };
            }

            const tokens = await this.prisma.token.findMany({
                take: limit,
                orderBy,
                include: {
                    _count: {
                        select: {
                            transfers: true,
                            balances: true
                        }
                    }
                }
            });

            // Add stats to tokens
            const tokensWithStats: TokenWithStats[] = await Promise.all(
                tokens.map(async (token) => {
                    const totalVolume = await this.calculateTokenVolume(token.id);
                    return {
                        ...token,
                        transferCount: token._count.transfers,
                        holderCount: token._count.balances,
                        totalVolume
                    };
                })
            );

            const duration = timer.end();
            log.debug('Top tokens retrieved', {
                ...context,
                sortBy,
                limit,
                returned: tokensWithStats.length,
                duration: `${duration}ms`
            });

            return tokensWithStats;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getTopTokens', 'tokens', context);
        }
    }

    /**
     * Health check implementation
     */
    async performHealthCheck(): Promise<ServiceHealthCheck> {
        try {
            const [tokenCount, transferCount, uniqueHolders] = await Promise.all([
                this.prisma.token.count(),
                this.prisma.tokenTransfer.count(),
                this.prisma.tokenBalance.count({
                    where: {
                        balance: {
                            not: '0'
                        }
                    }
                })
            ]);

            return {
                status: 'healthy',
                details: {
                    tokenCount,
                    transferCount,
                    uniqueHolders,
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