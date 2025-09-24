/**
 * Address tracking service for monitoring specific addresses
 */

import { PrismaClient, Address, TrackedAddress, Transaction, User, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

export interface CreateTrackedAddressData {
    userId: string;
    address: string;
    label?: string;
    alerts?: {
        incomingTransactions?: boolean;
        outgoingTransactions?: boolean;
        balanceThreshold?: string;
        tokenTransfers?: boolean;
    };
}

export interface UpdateTrackedAddressData {
    label?: string;
    alerts?: Record<string, any>;
}

export interface AddressStats {
    balance: string;
    transactionCount: number;
    firstSeen: Date;
    lastSeen: Date;
    tokenBalanceCount: number;
    recentTransactionCount: number;
}

export interface TrackedAddressWithDetails extends TrackedAddress {
    address: Address;
    user: User;
}

export class AddressTrackingService extends HealthCheckableService {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        super('AddressTrackingService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Add an address to user's tracking list
     */
    async trackAddress(
        trackingData: CreateTrackedAddressData,
        context: LogContext = {}
    ): Promise<TrackedAddressWithDetails> {
        const timer = this.startTimer('trackAddress');
        
        try {
            log.debug('Adding address to tracking', {
                ...context,
                userId: trackingData.userId,
                address: trackingData.address,
                label: trackingData.label
            });

            // Validate address format
            if (!this.isValidAddress(trackingData.address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            // Get or create address record
            const addressRecord = await this.prisma.address.upsert({
                where: { address: trackingData.address },
                update: {
                    isTracked: true,
                    lastSeenAt: new Date()
                },
                create: {
                    address: trackingData.address,
                    balance: '0',
                    nonce: 0n,
                    isContract: false,
                    isTracked: true,
                    firstSeenAt: new Date(),
                    lastSeenAt: new Date(),
                    transactionCount: 0
                }
            });

            // Create tracked address relationship
            const trackedAddress = await this.prisma.trackedAddress.create({
                data: {
                    userId: trackingData.userId,
                    addressId: addressRecord.id,
                    label: trackingData.label,
                    alerts: trackingData.alerts || {}
                },
                include: {
                    address: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true
                        }
                    }
                }
            }) as TrackedAddressWithDetails;

            const duration = timer.end();
            log.info('Address added to tracking successfully', {
                ...context,
                trackedAddressId: trackedAddress.id,
                address: trackingData.address,
                userId: trackingData.userId,
                duration: `${duration}ms`
            });

            return trackedAddress;
        } catch (error) {
            timer.end();
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ValidationError('Address is already being tracked by this user', 'address');
            }
            throw this.handleDatabaseError(error, 'trackAddress', 'tracked_addresses', context);
        }
    }

    /**
     * Remove an address from user's tracking list
     */
    async untrackAddress(
        userId: string,
        address: string,
        context: LogContext = {}
    ): Promise<void> {
        const timer = this.startTimer('untrackAddress');
        
        try {
            log.debug('Removing address from tracking', {
                ...context,
                userId,
                address
            });

            // Find the address record
            const addressRecord = await this.prisma.address.findUnique({
                where: { address }
            });

            if (!addressRecord) {
                throw new NotFoundError('Address not found');
            }

            // Delete the tracking relationship
            const deleted = await this.prisma.trackedAddress.deleteMany({
                where: {
                    userId,
                    addressId: addressRecord.id
                }
            });

            if (deleted.count === 0) {
                throw new NotFoundError('Tracked address not found for this user');
            }

            // Check if address is still tracked by other users
            const stillTracked = await this.prisma.trackedAddress.count({
                where: { addressId: addressRecord.id }
            });

            // If not tracked by anyone, update the address record
            if (stillTracked === 0) {
                await this.prisma.address.update({
                    where: { id: addressRecord.id },
                    data: { isTracked: false }
                });
            }

            const duration = timer.end();
            log.info('Address removed from tracking successfully', {
                ...context,
                address,
                userId,
                duration: `${duration}ms`
            });
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'untrackAddress', 'tracked_addresses', context);
        }
    }

    /**
     * Get all tracked addresses for a user
     */
    async getUserTrackedAddresses(
        userId: string,
        context: LogContext = {}
    ): Promise<TrackedAddressWithDetails[]> {
        const timer = this.startTimer('getUserTrackedAddresses');
        
        try {
            const trackedAddresses = await this.prisma.trackedAddress.findMany({
                where: { userId },
                include: {
                    address: {
                        include: {
                            tokenBalances: {
                                include: {
                                    token: true
                                }
                            }
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }) as TrackedAddressWithDetails[];

            const duration = timer.end();
            log.debug('User tracked addresses retrieved', {
                ...context,
                userId,
                count: trackedAddresses.length,
                duration: `${duration}ms`
            });

            return trackedAddresses;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getUserTrackedAddresses', 'tracked_addresses', context);
        }
    }

    /**
     * Update tracked address settings
     */
    async updateTrackedAddress(
        userId: string,
        address: string,
        updateData: UpdateTrackedAddressData,
        context: LogContext = {}
    ): Promise<TrackedAddressWithDetails> {
        const timer = this.startTimer('updateTrackedAddress');
        
        try {
            log.debug('Updating tracked address', {
                ...context,
                userId,
                address,
                updates: Object.keys(updateData)
            });

            // Find the address record
            const addressRecord = await this.prisma.address.findUnique({
                where: { address }
            });

            if (!addressRecord) {
                throw new NotFoundError('Address not found');
            }

            // Update the tracked address
            const updatedTrackedAddress = await this.prisma.trackedAddress.update({
                where: {
                    userId_addressId: {
                        userId,
                        addressId: addressRecord.id
                    }
                },
                data: updateData,
                include: {
                    address: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true
                        }
                    }
                }
            }) as TrackedAddressWithDetails;

            const duration = timer.end();
            log.info('Tracked address updated successfully', {
                ...context,
                trackedAddressId: updatedTrackedAddress.id,
                address,
                userId,
                duration: `${duration}ms`
            });

            return updatedTrackedAddress;
        } catch (error) {
            timer.end();
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new NotFoundError('Tracked address not found for this user');
            }
            throw this.handleDatabaseError(error, 'updateTrackedAddress', 'tracked_addresses', context);
        }
    }

    /**
     * Get address statistics
     */
    async getAddressStats(
        address: string,
        context: LogContext = {}
    ): Promise<AddressStats> {
        const timer = this.startTimer('getAddressStats');
        
        try {
            const addressRecord = await this.prisma.address.findUnique({
                where: { address },
                include: {
                    tokenBalances: true,
                    transactions: {
                        where: {
                            transaction: {
                                timestamp: {
                                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                                }
                            }
                        }
                    }
                }
            });

            if (!addressRecord) {
                throw new NotFoundError('Address not found');
            }

            const stats: AddressStats = {
                balance: addressRecord.balance,
                transactionCount: addressRecord.transactionCount,
                firstSeen: addressRecord.firstSeenAt,
                lastSeen: addressRecord.lastSeenAt,
                tokenBalanceCount: addressRecord.tokenBalances.length,
                recentTransactionCount: addressRecord.transactions.length
            };

            const duration = timer.end();
            log.debug('Address stats retrieved', {
                ...context,
                address,
                stats,
                duration: `${duration}ms`
            });

            return stats;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getAddressStats', 'addresses', context);
        }
    }

    /**
     * Get addresses that need alerts (have recent activity)
     */
    async getAddressesWithRecentActivity(
        hoursBack: number = 1,
        context: LogContext = {}
    ): Promise<TrackedAddressWithDetails[]> {
        const timer = this.startTimer('getAddressesWithRecentActivity');
        const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        
        try {
            const activeAddresses = await this.prisma.trackedAddress.findMany({
                where: {
                    address: {
                        transactions: {
                            some: {
                                transaction: {
                                    timestamp: {
                                        gte: cutoffTime
                                    }
                                }
                            }
                        }
                    }
                },
                include: {
                    address: {
                        include: {
                            transactions: {
                                where: {
                                    transaction: {
                                        timestamp: {
                                            gte: cutoffTime
                                        }
                                    }
                                },
                                include: {
                                    transaction: true
                                }
                            }
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true
                        }
                    }
                }
            }) as TrackedAddressWithDetails[];

            const duration = timer.end();
            log.debug('Addresses with recent activity retrieved', {
                ...context,
                hoursBack,
                count: activeAddresses.length,
                duration: `${duration}ms`
            });

            return activeAddresses;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'getAddressesWithRecentActivity', 'tracked_addresses', context);
        }
    }

    /**
     * Validate address format
     */
    private isValidAddress(address: string): boolean {
        // Basic Ethereum address validation (42 chars, starts with 0x)
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Get tracked address by user and address
     */
    async getTrackedAddress(
        userId: string,
        address: string,
        context: LogContext = {}
    ): Promise<TrackedAddressWithDetails | null> {
        try {
            const addressRecord = await this.prisma.address.findUnique({
                where: { address }
            });

            if (!addressRecord) {
                return null;
            }

            const trackedAddress = await this.prisma.trackedAddress.findUnique({
                where: {
                    userId_addressId: {
                        userId,
                        addressId: addressRecord.id
                    }
                },
                include: {
                    address: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            username: true
                        }
                    }
                }
            }) as TrackedAddressWithDetails | null;

            return trackedAddress;
        } catch (error) {
            throw this.handleDatabaseError(error, 'getTrackedAddress', 'tracked_addresses', context);
        }
    }

    /**
     * Bulk update address balances (for periodic sync)
     */
    async updateAddressBalances(
        addressBalances: Array<{ address: string; balance: string }>,
        context: LogContext = {}
    ): Promise<number> {
        const timer = this.startTimer('updateAddressBalances');
        let updated = 0;
        
        try {
            for (const { address, balance } of addressBalances) {
                await this.prisma.address.updateMany({
                    where: { address },
                    data: {
                        balance,
                        lastSeenAt: new Date()
                    }
                });
                updated++;
            }

            const duration = timer.end();
            log.info('Address balances updated', {
                ...context,
                updated,
                total: addressBalances.length,
                duration: `${duration}ms`
            });

            return updated;
        } catch (error) {
            timer.end();
            throw this.handleDatabaseError(error, 'updateAddressBalances', 'addresses', context);
        }
    }

    /**
     * Health check implementation
     */
    async performHealthCheck(): Promise<ServiceHealthCheck> {
        try {
            const [trackedCount, addressCount, recentActivity] = await Promise.all([
                this.prisma.trackedAddress.count(),
                this.prisma.address.count({ where: { isTracked: true } }),
                this.prisma.trackedAddress.count({
                    where: {
                        address: {
                            lastSeenAt: {
                                gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                            }
                        }
                    }
                })
            ]);

            return {
                status: 'healthy',
                details: {
                    trackedAddresses: trackedCount,
                    uniqueAddresses: addressCount,
                    recentActivity,
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