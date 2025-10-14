/**
 * Usage Examples for Async Cache Invalidation Service
 */

import { asyncCacheInvalidation } from './async-cache-invalidation';

/**
 * Example 1: Basic key invalidation (non-blocking)
 */
export function example1_basicInvalidation() {
    // This returns immediately without blocking
    asyncCacheInvalidation.invalidateByKey('user:123', 'User updated');
    
    console.log('Invalidation scheduled, continuing execution...');
    // Your code continues immediately
}

/**
 * Example 2: Invalidate multiple keys
 */
export function example2_multipleKeys() {
    const userKeys = [
        'user:123:profile',
        'user:123:settings',
        'user:123:permissions'
    ];
    
    // Non-blocking batch invalidation
    asyncCacheInvalidation.invalidateByKeys(userKeys, 'User data changed');
}

/**
 * Example 3: Pattern-based invalidation
 */
export function example3_patternInvalidation() {
    // Invalidate all user-related cache entries
    asyncCacheInvalidation.invalidateByPattern('user:*', 'Bulk user update');
    
    // Invalidate all API response caches
    asyncCacheInvalidation.invalidateByPattern('api:response:*', 'API schema changed');
}

/**
 * Example 4: High-frequency invalidations with automatic debouncing
 */
export function example4_highFrequency() {
    // These will be debounced automatically
    // Only the last one will execute after 100ms
    for (let i = 0; i < 100; i++) {
        asyncCacheInvalidation.invalidateByKey('token:price:ETH', 'Price update');
    }
    
    console.log('100 invalidations scheduled, but only 1 will execute due to debouncing');
}

/**
 * Example 5: Token trading scenario (real-world use case)
 */
export async function example5_tokenTrading(tokenAddress: string) {
    // After processing a trade, invalidate related caches
    // This is non-blocking and won't slow down trade processing
    
    asyncCacheInvalidation.invalidateByKeys([
        `token:${tokenAddress}:price`,
        `token:${tokenAddress}:volume`,
        `token:${tokenAddress}:holders`
    ], 'Trade processed');
    
    // Trade processing continues immediately
    console.log('Trade processed, cache invalidation scheduled');
}

/**
 * Example 6: Monitoring and statistics
 */
export function example6_monitoring() {
    const stats = asyncCacheInvalidation.getStats();
    
    console.log('Cache Invalidation Stats:', {
        queued: stats.queued,
        processed: stats.processed,
        failed: stats.failed,
        dropped: stats.dropped,
        debounced: stats.debounced,
        currentQueueSize: stats.queueSize,
        maxQueueSize: stats.maxQueueSize
    });
    
    // Check if queue is getting full
    if (stats.queueSize > stats.maxQueueSize * 0.8) {
        console.warn('Cache invalidation queue is 80% full!');
    }
}

/**
 * Example 7: Graceful shutdown
 */
export async function example7_gracefulShutdown() {
    console.log('Application shutting down...');
    
    // Flush all pending invalidations before shutdown
    await asyncCacheInvalidation.flush();
    
    console.log('All cache invalidations processed');
    
    // Now safe to shutdown
    await asyncCacheInvalidation.shutdown();
}

/**
 * Example 8: Custom configuration
 */
export function example8_customConfiguration() {
    // Adjust configuration for your use case
    asyncCacheInvalidation.configure({
        maxQueueSize: 20000,  // Increase queue size for high-traffic
        debounceMs: 50,       // Faster debouncing
        batchSize: 100        // Larger batches for better throughput
    });
}

/**
 * Example 9: Error handling (automatic)
 */
export function example9_errorHandling() {
    // Even if Redis is down, this won't throw or block
    asyncCacheInvalidation.invalidateByKey('some:key', 'Update');
    
    // Errors are logged as warnings, not thrown
    // Your application continues running
    console.log('Invalidation scheduled, errors handled gracefully');
}

/**
 * Example 10: Integration with trade processing
 */
export async function example10_tradeProcessing(trades: any[]) {
    const startTime = Date.now();
    
    // Process trades
    for (const trade of trades) {
        // ... process trade logic ...
        
        // Invalidate cache asynchronously (non-blocking)
        asyncCacheInvalidation.invalidateByKey(
            `token:${trade.tokenAddress}:stats`,
            'Trade processed'
        );
    }
    
    const duration = Date.now() - startTime;
    console.log(`Processed ${trades.length} trades in ${duration}ms`);
    console.log('Cache invalidations scheduled asynchronously');
}

/**
 * Example 11: Preventing memory leaks
 */
export function example11_memoryLeakPrevention() {
    // The service automatically prevents memory leaks by:
    // 1. Bounded queue size (drops old requests if full)
    // 2. Debouncing (prevents duplicate pending invalidations)
    // 3. Automatic cleanup of pending timeouts
    
    // Check pending invalidations
    const pendingCount = asyncCacheInvalidation.getPendingCount();
    console.log(`Pending invalidations: ${pendingCount}`);
    
    // If needed, clear all pending (emergency cleanup)
    if (pendingCount > 1000) {
        asyncCacheInvalidation.clearPending();
        console.log('Cleared excessive pending invalidations');
    }
}

/**
 * Example 12: Performance comparison
 */
export async function example12_performanceComparison() {
    // BLOCKING approach (old way)
    const blockingStart = Date.now();
    // await cacheService.delete('key1');
    // await cacheService.delete('key2');
    // await cacheService.delete('key3');
    const blockingDuration = Date.now() - blockingStart;
    console.log(`Blocking approach: ${blockingDuration}ms`);
    
    // NON-BLOCKING approach (new way)
    const nonBlockingStart = Date.now();
    asyncCacheInvalidation.invalidateByKey('key1');
    asyncCacheInvalidation.invalidateByKey('key2');
    asyncCacheInvalidation.invalidateByKey('key3');
    const nonBlockingDuration = Date.now() - nonBlockingStart;
    console.log(`Non-blocking approach: ${nonBlockingDuration}ms`);
    
    console.log(`Speed improvement: ${blockingDuration / nonBlockingDuration}x faster`);
}
