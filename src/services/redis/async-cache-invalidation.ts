/**
 * Async Cache Invalidation Service
 * 
 * High-performance cache invalidation with:
 * - Non-blocking execution using setImmediate()
 * - Error handling that logs warnings but doesn't throw
 * - Debouncing for multiple invalidations of same token
 * - Pending invalidation tracking to prevent memory leaks
 * - Bounded queue with configurable size
 */

import { cacheService } from './cache';
import { log } from '../../utils/logger';

export interface AsyncInvalidationOptions {
    debounceMs?: number;
    maxQueueSize?: number;
    batchSize?: number;
}

export interface InvalidationRequest {
    type: 'key' | 'pattern' | 'keys';
    target: string | string[];
    timestamp: number;
    reason?: string;
}

export interface AsyncInvalidationStats {
    queued: number;
    processed: number;
    failed: number;
    dropped: number;
    debounced: number;
    queueSize: number;
    maxQueueSize: number;
}

interface PendingInvalidation {
    timeout: NodeJS.Timeout;
    request: InvalidationRequest;
}

class AsyncCacheInvalidationService {
    private invalidationQueue: InvalidationRequest[] = [];
    private pendingInvalidations = new Map<string, PendingInvalidation>();
    private processing = false;
    private maxQueueSize: number;
    private debounceMs: number;
    private batchSize: number;

    private stats: AsyncInvalidationStats = {
        queued: 0,
        processed: 0,
        failed: 0,
        dropped: 0,
        debounced: 0,
        queueSize: 0,
        maxQueueSize: 10000
    };

    constructor(options: AsyncInvalidationOptions = {}) {
        this.maxQueueSize = options.maxQueueSize || 10000;
        this.debounceMs = options.debounceMs || 100;
        this.batchSize = options.batchSize || 50;
        this.stats.maxQueueSize = this.maxQueueSize;
    }

    /**
     * Invalidate cache by key (async, non-blocking)
     */
    invalidateByKey(key: string, reason?: string): void {
        this.scheduleInvalidation({
            type: 'key',
            target: key,
            timestamp: Date.now(),
            reason
        });
    }

    /**
     * Invalidate cache by multiple keys (async, non-blocking)
     */
    invalidateByKeys(keys: string[], reason?: string): void {
        this.scheduleInvalidation({
            type: 'keys',
            target: keys,
            timestamp: Date.now(),
            reason
        });
    }

    /**
     * Invalidate cache by pattern (async, non-blocking)
     */
    invalidateByPattern(pattern: string, reason?: string): void {
        this.scheduleInvalidation({
            type: 'pattern',
            target: pattern,
            timestamp: Date.now(),
            reason
        });
    }

    /**
     * Schedule invalidation with debouncing
     */
    private scheduleInvalidation(request: InvalidationRequest): void {
        const targetKey = this.getTargetKey(request);

        // Check if we already have a pending invalidation for this target
        const existing = this.pendingInvalidations.get(targetKey);
        if (existing) {
            // Clear existing timeout and reschedule (debouncing)
            clearTimeout(existing.timeout);
            this.stats.debounced++;
            
            log.debug('Debouncing cache invalidation', {
                type: request.type,
                target: targetKey,
                reason: request.reason
            });
        }

        // Schedule new invalidation with debouncing
        const timeout = setTimeout(() => {
            this.pendingInvalidations.delete(targetKey);
            this.enqueueInvalidation(request);
        }, this.debounceMs);

        this.pendingInvalidations.set(targetKey, { timeout, request });
    }

    /**
     * Get unique key for target to track pending invalidations
     */
    private getTargetKey(request: InvalidationRequest): string {
        if (request.type === 'keys') {
            return `keys:${(request.target as string[]).sort().join(',')}`;
        }
        return `${request.type}:${request.target}`;
    }

    /**
     * Enqueue invalidation request
     */
    private enqueueInvalidation(request: InvalidationRequest): void {
        // Check queue size limit
        if (this.invalidationQueue.length >= this.maxQueueSize) {
            this.stats.dropped++;
            
            log.warn('Cache invalidation queue full, dropping request', {
                queueSize: this.invalidationQueue.length,
                maxQueueSize: this.maxQueueSize,
                type: request.type,
                target: this.getTargetKey(request)
            });
            
            return;
        }

        // Add to queue
        this.invalidationQueue.push(request);
        this.stats.queued++;
        this.stats.queueSize = this.invalidationQueue.length;

        log.debug('Cache invalidation enqueued', {
            type: request.type,
            queueSize: this.invalidationQueue.length,
            reason: request.reason
        });

        // Process queue asynchronously (non-blocking)
        this.processQueueAsync();
    }

    /**
     * Process invalidation queue asynchronously using setImmediate()
     */
    private processQueueAsync(): void {
        // Prevent multiple concurrent processing
        if (this.processing) {
            return;
        }

        this.processing = true;

        // Use setImmediate for non-blocking execution
        setImmediate(async () => {
            try {
                await this.processQueue();
            } catch (error) {
                // Log error but don't throw - non-blocking error handling
                log.warn('Error processing cache invalidation queue', {
                    error: error instanceof Error ? error.message : String(error),
                    queueSize: this.invalidationQueue.length
                });
            } finally {
                this.processing = false;

                // If there are more items in queue, schedule another processing
                if (this.invalidationQueue.length > 0) {
                    this.processQueueAsync();
                }
            }
        });
    }

    /**
     * Process invalidation queue in batches
     */
    private async processQueue(): Promise<void> {
        // Process in batches to avoid blocking
        const batch = this.invalidationQueue.splice(0, this.batchSize);
        
        if (batch.length === 0) {
            return;
        }

        log.debug('Processing cache invalidation batch', {
            batchSize: batch.length,
            remainingQueue: this.invalidationQueue.length
        });

        // Process each invalidation request
        for (const request of batch) {
            try {
                await this.executeInvalidation(request);
                this.stats.processed++;
            } catch (error) {
                this.stats.failed++;
                
                // Log warning but don't throw - graceful error handling
                log.warn('Cache invalidation failed', {
                    type: request.type,
                    target: request.target,
                    reason: request.reason,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        this.stats.queueSize = this.invalidationQueue.length;
    }

    /**
     * Execute single invalidation request
     */
    private async executeInvalidation(request: InvalidationRequest): Promise<void> {
        switch (request.type) {
            case 'key':
                await cacheService.delete(request.target as string);
                log.debug('Cache key invalidated', {
                    key: request.target,
                    reason: request.reason
                });
                break;

            case 'keys':
                const keys = request.target as string[];
                await cacheService.deleteMany(keys);
                log.debug('Cache keys invalidated', {
                    count: keys.length,
                    reason: request.reason
                });
                break;

            case 'pattern':
                const deletedCount = await cacheService.deleteByPattern(request.target as string);
                log.debug('Cache pattern invalidated', {
                    pattern: request.target,
                    deletedCount,
                    reason: request.reason
                });
                break;

            default:
                log.warn('Unknown invalidation type', {
                    type: request.type
                });
        }
    }

    /**
     * Flush all pending invalidations immediately
     */
    async flush(): Promise<void> {
        log.info('Flushing cache invalidation queue', {
            queueSize: this.invalidationQueue.length,
            pendingDebounces: this.pendingInvalidations.size
        });

        // First, enqueue all pending debounced requests immediately
        for (const [_targetKey, pending] of this.pendingInvalidations.entries()) {
            clearTimeout(pending.timeout);
            this.invalidationQueue.push(pending.request);
        }
        this.pendingInvalidations.clear();

        // Process all remaining items in queue
        while (this.invalidationQueue.length > 0) {
            try {
                await this.processQueue();
            } catch (error) {
                log.warn('Error during flush', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        log.info('Cache invalidation queue flushed');
    }

    /**
     * Get invalidation statistics
     */
    getStats(): AsyncInvalidationStats {
        return {
            ...this.stats,
            queueSize: this.invalidationQueue.length
        };
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.stats = {
            queued: 0,
            processed: 0,
            failed: 0,
            dropped: 0,
            debounced: 0,
            queueSize: this.invalidationQueue.length,
            maxQueueSize: this.maxQueueSize
        };
    }

    /**
     * Update configuration
     */
    configure(options: AsyncInvalidationOptions): void {
        if (options.maxQueueSize !== undefined) {
            this.maxQueueSize = options.maxQueueSize;
            this.stats.maxQueueSize = options.maxQueueSize;
        }
        if (options.debounceMs !== undefined) {
            this.debounceMs = options.debounceMs;
        }
        if (options.batchSize !== undefined) {
            this.batchSize = options.batchSize;
        }

        log.info('Async cache invalidation configured', {
            maxQueueSize: this.maxQueueSize,
            debounceMs: this.debounceMs,
            batchSize: this.batchSize
        });
    }

    /**
     * Get pending invalidation count
     */
    getPendingCount(): number {
        return this.pendingInvalidations.size;
    }

    /**
     * Clear all pending invalidations (for cleanup)
     */
    clearPending(): void {
        for (const pending of this.pendingInvalidations.values()) {
            clearTimeout(pending.timeout);
        }
        this.pendingInvalidations.clear();
        
        log.info('Cleared all pending cache invalidations', {
            clearedCount: this.pendingInvalidations.size
        });
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        log.info('Shutting down async cache invalidation service');
        
        // Flush all pending invalidations
        await this.flush();
        
        log.info('Async cache invalidation service shut down');
    }
}

// Export singleton instance with default configuration
export const asyncCacheInvalidation = new AsyncCacheInvalidationService({
    maxQueueSize: 10000,
    debounceMs: 100,
    batchSize: 50
});

// Export class for testing
export { AsyncCacheInvalidationService };
