/**
 * Blockchain Synchronization Service
 * Handles continuous blockchain data synchronization and real-time updates
 */

import { log, LogContext } from '../../utils/logger';
import { InternalServerError, ExternalServiceError } from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from '../database/service-base';
import { MonadClientService } from './monad-client';
import { BlockchainTrackerService } from '../database/blockchain-tracker-service';
import { NadFunService } from './nad-fun-service';
import { pubSubService } from '../redis/pubsub';

export interface SyncConfiguration {
    enabled: boolean;
    syncInterval: number; // milliseconds
    batchSize: number;
    startBlock?: bigint;
    catchupMode: boolean; // true for historical sync, false for real-time
    maxReorgDepth: number; // blocks to check for reorganizations
}

export interface SyncMetrics {
    lastSyncedBlock: bigint;
    blocksProcessed: number;
    transactionsProcessed: number;
    eventsProcessed: number;
    errorsCount: number;
    avgBlockTime: number;
    syncSpeed: number; // blocks per second
    startTime: Date;
    lastSyncTime: Date;
}

export class BlockchainSyncService extends HealthCheckableService {
    private config: SyncConfiguration;
    private metrics: SyncMetrics;
    private isRunning: boolean = false;
    private syncInterval: NodeJS.Timeout | null = null;
    
    private monadClient: MonadClientService;
    private blockchainTracker: BlockchainTrackerService;
    private nadFunService: NadFunService;

    constructor(
        config?: Partial<SyncConfiguration>,
        monadClient?: MonadClientService,
        blockchainTracker?: BlockchainTrackerService,
        nadFunService?: NadFunService
    ) {
        super('BlockchainSyncService');
        
        this.config = {
            enabled: process.env.BLOCKCHAIN_SYNC_ENABLED === 'true',
            syncInterval: parseInt(process.env.BLOCKCHAIN_SYNC_INTERVAL || '5000'),
            batchSize: parseInt(process.env.BLOCKCHAIN_SYNC_BATCH_SIZE || '10'),
            startBlock: process.env.BLOCKCHAIN_START_BLOCK ? BigInt(process.env.BLOCKCHAIN_START_BLOCK) : undefined,
            catchupMode: true,
            maxReorgDepth: 10,
            ...config
        };

        this.metrics = {
            lastSyncedBlock: BigInt(0),
            blocksProcessed: 0,
            transactionsProcessed: 0,
            eventsProcessed: 0,
            errorsCount: 0,
            avgBlockTime: 0,
            syncSpeed: 0,
            startTime: new Date(),
            lastSyncTime: new Date()
        };

        this.monadClient = monadClient || new MonadClientService();
        this.blockchainTracker = blockchainTracker || new BlockchainTrackerService();
        this.nadFunService = nadFunService || new NadFunService();
    }

    /**
     * Start the blockchain synchronization service
     */
    async start(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        if (!this.config.enabled) {
            logger.info('Blockchain sync is disabled');
            return;
        }

        if (this.isRunning) {
            logger.warn('Blockchain sync is already running');
            return;
        }

        try {
            logger.info('Starting blockchain synchronization service', { config: this.config });

            // Initialize metrics
            this.metrics.startTime = new Date();
            this.metrics.lastSyncedBlock = await this.blockchainTracker.getLastSyncedBlock('blocks', context);

            // Determine sync mode
            const latestBlock = await this.monadClient.getLatestBlockNumber(context);
            const blocksBehind = latestBlock - this.metrics.lastSyncedBlock;
            
            this.config.catchupMode = blocksBehind > BigInt(this.config.batchSize * 2);
            
            logger.info('Sync mode determined', {
                latestBlock: latestBlock.toString(),
                lastSyncedBlock: this.metrics.lastSyncedBlock.toString(),
                blocksBehind: blocksBehind.toString(),
                catchupMode: this.config.catchupMode
            });

            this.isRunning = true;

            // Start sync loop
            this.syncInterval = setInterval(async () => {
                try {
                    await this.performSync(context);
                } catch (error) {
                    logger.error('Sync iteration failed', error instanceof Error ? error : new Error(String(error)));
                    this.metrics.errorsCount++;
                }
            }, this.config.syncInterval);

            // Initial sync
            await this.performSync(context);

            logger.info('Blockchain synchronization service started successfully');

        } catch (error) {
            logger.error('Failed to start blockchain synchronization', error instanceof Error ? error : new Error(String(error)));
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the blockchain synchronization service
     */
    async stop(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        if (!this.isRunning) {
            logger.warn('Blockchain sync is not running');
            return;
        }

        try {
            logger.info('Stopping blockchain synchronization service');

            this.isRunning = false;

            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }

            logger.info('Blockchain synchronization service stopped', { metrics: this.metrics });

        } catch (error) {
            logger.error('Failed to stop blockchain synchronization', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Perform a single sync iteration
     */
    private async performSync(context?: LogContext): Promise<void> {
        const logger = log.child(context || {});
        const syncStart = Date.now();

        try {
            // Get current blockchain state
            const latestBlock = await this.monadClient.getLatestBlockNumber(context);
            const lastSyncedBlock = await this.blockchainTracker.getLastSyncedBlock('blocks', context);

            if (lastSyncedBlock >= latestBlock) {
                logger.debug('Already up to date', {
                    latestBlock: latestBlock.toString(),
                    lastSyncedBlock: lastSyncedBlock.toString()
                });
                return;
            }

            // Determine sync range
            let fromBlock = lastSyncedBlock + BigInt(1);
            let toBlock = fromBlock + BigInt(this.config.batchSize) - BigInt(1);

            // Don't sync beyond the latest block
            if (toBlock > latestBlock) {
                toBlock = latestBlock;
            }

            // Check for potential reorganization
            if (lastSyncedBlock > 0) {
                await this.checkForReorganization(lastSyncedBlock, context);
            }

            logger.info('Starting sync batch', {
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString(),
                batchSize: (toBlock - fromBlock + BigInt(1)).toString(),
                catchupMode: this.config.catchupMode
            });

            // Sync the block range
            const syncedBlocks = await this.blockchainTracker.syncBlockRange(fromBlock, toBlock, context);
            
            // Process nad.fun events for the synced blocks
            await this.processNadFunEvents(fromBlock, toBlock, context);

            // Update metrics
            this.metrics.blocksProcessed += syncedBlocks;
            this.metrics.lastSyncedBlock = toBlock;
            this.metrics.lastSyncTime = new Date();

            const syncDuration = Date.now() - syncStart;
            this.metrics.syncSpeed = syncedBlocks / (syncDuration / 1000);

            // Publish sync progress event
            await pubSubService.publish('blockchain:sync:progress', {
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString(),
                syncedBlocks,
                metrics: this.metrics,
                timestamp: new Date()
            });

            logger.info('Sync batch completed', {
                syncedBlocks,
                duration: syncDuration,
                speed: this.metrics.syncSpeed.toFixed(2) + ' blocks/sec'
            });

            // Switch to real-time mode if caught up
            if (this.config.catchupMode && toBlock >= latestBlock - BigInt(this.config.batchSize)) {
                this.config.catchupMode = false;
                logger.info('Switched to real-time sync mode');
            }

        } catch (error) {
            logger.error('Sync iteration failed', error instanceof Error ? error : new Error(String(error)));
            this.metrics.errorsCount++;
            throw error;
        }
    }

    /**
     * Check for blockchain reorganizations
     */
    private async checkForReorganization(lastSyncedBlock: bigint, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            // Check the last few blocks for reorganization
            const checkDepth = Math.min(Number(lastSyncedBlock), this.config.maxReorgDepth);
            const startBlock = lastSyncedBlock - BigInt(checkDepth) + BigInt(1);

            logger.debug('Checking for reorganization', {
                startBlock: startBlock.toString(),
                endBlock: lastSyncedBlock.toString(),
                checkDepth
            });

            for (let blockNum = startBlock; blockNum <= lastSyncedBlock; blockNum++) {
                // Get block from blockchain
                const chainBlock = await this.monadClient.getBlockByNumber(blockNum, false, context);
                
                // Get block from database
                const dbBlock = await this.blockchainTracker.prisma.block.findUnique({
                    where: { blockNumber: blockNum }
                });

                if (!dbBlock) {
                    logger.warn('Block not found in database during reorg check', {
                        blockNumber: blockNum.toString()
                    });
                    continue;
                }

                // Check if block hashes match
                if (dbBlock.blockHash !== chainBlock.hash) {
                    logger.warn('Reorganization detected', {
                        blockNumber: blockNum.toString(),
                        expectedHash: chainBlock.hash,
                        storedHash: dbBlock.blockHash
                    });

                    // Handle reorganization by resyncing from this block
                    await this.handleReorganization(blockNum, context);
                    break;
                }
            }

        } catch (error) {
            logger.error('Failed to check for reorganization', error instanceof Error ? error : new Error(String(error)));
            // Don't throw - reorganization check shouldn't stop sync
        }
    }

    /**
     * Handle blockchain reorganization
     */
    private async handleReorganization(fromBlock: bigint, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            logger.warn('Handling blockchain reorganization', { fromBlock: fromBlock.toString() });

            // Delete blocks and transactions from reorganized chain
            await this.blockchainTracker.prisma.$transaction(async (tx) => {
                // Delete transaction logs
                await tx.transactionLog.deleteMany({
                    where: { blockNumber: { gte: fromBlock } }
                });

                // Delete nad.fun events
                await tx.nadFunEvent.deleteMany({
                    where: { blockNumber: { gte: fromBlock } }
                });

                // Delete transactions
                await tx.transaction.deleteMany({
                    where: { blockNumber: { gte: fromBlock } }
                });

                // Delete blocks
                await tx.block.deleteMany({
                    where: { blockNumber: { gte: fromBlock } }
                });
            });

            // Update sync status to resync from the reorganized block
            await this.blockchainTracker.updateSyncStatus({
                component: 'blocks',
                lastSyncedBlock: fromBlock - BigInt(1),
                isHealthy: true,
                lastSyncAt: new Date()
            }, context);

            // Update metrics
            this.metrics.lastSyncedBlock = fromBlock - BigInt(1);

            // Publish reorganization event
            await pubSubService.publish('blockchain:reorganization', {
                fromBlock: fromBlock.toString(),
                timestamp: new Date()
            });

            logger.info('Reorganization handled successfully', { 
                newLastSyncedBlock: (fromBlock - BigInt(1)).toString()
            });

        } catch (error) {
            logger.error('Failed to handle reorganization', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Process nad.fun events for a block range
     */
    private async processNadFunEvents(fromBlock: bigint, toBlock: bigint, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});

        try {
            logger.debug('Processing nad.fun events', {
                fromBlock: fromBlock.toString(),
                toBlock: toBlock.toString()
            });

            // Get logs for nad.fun program addresses
            const nadFunAddresses = process.env.NAD_FUN_PROGRAM_ADDRESSES?.split(',') || [];
            
            if (nadFunAddresses.length === 0) {
                logger.debug('No nad.fun program addresses configured');
                return;
            }

            const logs = await this.monadClient.getLogs({
                fromBlock: `0x${fromBlock.toString(16)}`,
                toBlock: `0x${toBlock.toString(16)}`,
                address: nadFunAddresses
            }, context);

            if (logs.length === 0) {
                logger.debug('No nad.fun events found in block range');
                return;
            }

            // Parse and store nad.fun events
            const nadFunEvents = await this.nadFunService.parseNadFunEvents(logs, context);
            
            for (const eventData of nadFunEvents) {
                await this.nadFunService.storeNadFunEvent(eventData, context);
                this.metrics.eventsProcessed++;
            }

            // Publish nad.fun events
            if (nadFunEvents.length > 0) {
                await pubSubService.publish('nad-fun:events', {
                    events: nadFunEvents,
                    blockRange: { fromBlock: fromBlock.toString(), toBlock: toBlock.toString() },
                    timestamp: new Date()
                });
            }

            logger.debug('nad.fun events processed', { eventsCount: nadFunEvents.length });

        } catch (error) {
            logger.error('Failed to process nad.fun events', error instanceof Error ? error : new Error(String(error)));
            // Don't throw - event processing shouldn't stop block sync
        }
    }

    /**
     * Get current sync metrics
     */
    getSyncMetrics(): SyncMetrics {
        return { ...this.metrics };
    }

    /**
     * Update sync configuration
     */
    updateConfiguration(config: Partial<SyncConfiguration>): void {
        this.config = { ...this.config, ...config };
        log.info('Sync configuration updated', { config: this.config });
    }

    /**
     * Health check implementation
     */
    async checkHealth(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = log.child(context || {});
        const startTime = Date.now();

        try {
            logger.debug('Performing blockchain sync service health check');

            const now = Date.now();
            const timeSinceLastSync = now - this.metrics.lastSyncTime.getTime();
            const maxSyncAge = this.config.syncInterval * 3; // Allow up to 3 sync intervals

            const isHealthy = this.isRunning && 
                             this.config.enabled && 
                             timeSinceLastSync < maxSyncAge &&
                             this.metrics.errorsCount < 10; // Allow some errors

            const duration = Date.now() - startTime;

            logger.debug('Blockchain sync service health check completed', { 
                duration,
                isHealthy,
                isRunning: this.isRunning,
                timeSinceLastSync,
                errorsCount: this.metrics.errorsCount
            });

            return {
                service: this.serviceName,
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date(),
                details: {
                    isRunning: this.isRunning,
                    enabled: this.config.enabled,
                    lastSyncedBlock: this.metrics.lastSyncedBlock.toString(),
                    timeSinceLastSync,
                    errorsCount: this.metrics.errorsCount,
                    syncSpeed: this.metrics.syncSpeed,
                    catchupMode: this.config.catchupMode,
                    responseTime: duration
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('Blockchain sync service health check failed', error instanceof Error ? error : new Error(String(error)));

            return {
                service: this.serviceName,
                status: 'unhealthy',
                timestamp: new Date(),
                error: error instanceof Error ? error.message : String(error),
                details: {
                    responseTime: duration
                }
            };
        }
    }
}