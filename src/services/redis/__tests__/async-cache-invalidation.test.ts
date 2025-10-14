/**
 * Tests for Async Cache Invalidation Service
 */

import { AsyncCacheInvalidationService } from '../async-cache-invalidation';
import { cacheService } from '../cache';

// Mock the cache service
jest.mock('../cache', () => ({
    cacheService: {
        delete: jest.fn(),
        deleteMany: jest.fn(),
        deleteByPattern: jest.fn()
    }
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
    log: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

describe('AsyncCacheInvalidationService', () => {
    let service: AsyncCacheInvalidationService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AsyncCacheInvalidationService({
            maxQueueSize: 100,
            debounceMs: 50,
            batchSize: 10
        });
    });

    afterEach(async () => {
        await service.shutdown();
    });

    describe('invalidateByKey', () => {
        it('should schedule key invalidation asynchronously', async () => {
            service.invalidateByKey('test:key', 'test reason');

            // Should be queued but not processed yet
            const stats = service.getStats();
            expect(stats.queued).toBe(0); // Not queued yet due to debouncing

            // Wait for debounce and processing
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(cacheService.delete).toHaveBeenCalledWith('test:key');
        });

        it('should handle multiple invalidations of same key with debouncing', async () => {
            service.invalidateByKey('test:key', 'reason 1');
            service.invalidateByKey('test:key', 'reason 2');
            service.invalidateByKey('test:key', 'reason 3');

            // Wait for debounce and processing
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should only call delete once due to debouncing
            expect(cacheService.delete).toHaveBeenCalledTimes(1);
            expect(cacheService.delete).toHaveBeenCalledWith('test:key');

            const stats = service.getStats();
            expect(stats.debounced).toBeGreaterThan(0);
        });

        it('should not throw on cache deletion errors', async () => {
            (cacheService.delete as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));

            service.invalidateByKey('test:key');

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not throw, just log warning
            const stats = service.getStats();
            expect(stats.failed).toBe(1);
        });
    });

    describe('invalidateByKeys', () => {
        it('should schedule multiple keys invalidation', async () => {
            const keys = ['key1', 'key2', 'key3'];
            service.invalidateByKeys(keys, 'batch reason');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(cacheService.deleteMany).toHaveBeenCalledWith(keys);
        });

        it('should debounce same set of keys', async () => {
            const keys = ['key1', 'key2'];
            
            service.invalidateByKeys(keys, 'reason 1');
            service.invalidateByKeys(keys, 'reason 2');

            await new Promise(resolve => setTimeout(resolve, 150));

            // Should only call once due to debouncing
            expect(cacheService.deleteMany).toHaveBeenCalledTimes(1);
        });
    });

    describe('invalidateByPattern', () => {
        it('should schedule pattern invalidation', async () => {
            service.invalidateByPattern('user:*', 'clear user cache');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(cacheService.deleteByPattern).toHaveBeenCalledWith('user:*');
        });

        it('should debounce same pattern', async () => {
            service.invalidateByPattern('user:*', 'reason 1');
            service.invalidateByPattern('user:*', 'reason 2');

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(cacheService.deleteByPattern).toHaveBeenCalledTimes(1);
        });
    });

    describe('queue management', () => {
        it('should respect max queue size', async () => {
            const smallService = new AsyncCacheInvalidationService({
                maxQueueSize: 5,
                debounceMs: 10,
                batchSize: 2
            });

            // Add more items than max queue size
            for (let i = 0; i < 10; i++) {
                smallService.invalidateByKey(`key${i}`);
            }

            await new Promise(resolve => setTimeout(resolve, 50));

            const stats = smallService.getStats();
            expect(stats.dropped).toBeGreaterThan(0);

            await smallService.shutdown();
        });

        it('should process queue in batches', async () => {
            const batchService = new AsyncCacheInvalidationService({
                maxQueueSize: 100,
                debounceMs: 10,
                batchSize: 3
            });

            // Add multiple items
            for (let i = 0; i < 10; i++) {
                batchService.invalidateByKey(`key${i}`);
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            const stats = batchService.getStats();
            expect(stats.processed).toBe(10);

            await batchService.shutdown();
        });

        it('should track queue size correctly', () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');
            service.invalidateByKey('key3');

            const stats = service.getStats();
            expect(stats.queueSize).toBeLessThanOrEqual(3);
        });
    });

    describe('flush', () => {
        it('should flush all pending invalidations', async () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');
            service.invalidateByKey('key3');

            await service.flush();

            const stats = service.getStats();
            expect(stats.queueSize).toBe(0);
            // After flush, all items should be processed
            expect(cacheService.delete).toHaveBeenCalledTimes(3);
        });

        it('should clear pending debounce timeouts', async () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');

            const pendingBefore = service.getPendingCount();
            expect(pendingBefore).toBeGreaterThan(0);

            await service.flush();

            const pendingAfter = service.getPendingCount();
            expect(pendingAfter).toBe(0);
        });
    });

    describe('statistics', () => {
        it('should track processed invalidations', async () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = service.getStats();
            expect(stats.processed).toBe(2);
        });

        it('should track failed invalidations', async () => {
            (cacheService.delete as jest.Mock).mockRejectedValue(new Error('Redis error'));

            service.invalidateByKey('key1');

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = service.getStats();
            expect(stats.failed).toBe(1);
        });

        it('should track debounced invalidations', async () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key1');
            service.invalidateByKey('key1');

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = service.getStats();
            expect(stats.debounced).toBe(2);
        });

        it('should reset statistics', async () => {
            service.invalidateByKey('key1');
            await new Promise(resolve => setTimeout(resolve, 100));

            service.resetStats();

            const stats = service.getStats();
            expect(stats.processed).toBe(0);
            expect(stats.failed).toBe(0);
            expect(stats.debounced).toBe(0);
        });
    });

    describe('configuration', () => {
        it('should update configuration', () => {
            service.configure({
                maxQueueSize: 200,
                debounceMs: 150,
                batchSize: 20
            });

            const stats = service.getStats();
            expect(stats.maxQueueSize).toBe(200);
        });
    });

    describe('memory leak prevention', () => {
        it('should clear pending invalidations on shutdown', async () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');
            service.invalidateByKey('key3');

            const pendingBefore = service.getPendingCount();
            expect(pendingBefore).toBeGreaterThan(0);

            await service.shutdown();

            const pendingAfter = service.getPendingCount();
            expect(pendingAfter).toBe(0);
        });

        it('should not accumulate pending invalidations indefinitely', async () => {
            // Add many invalidations
            for (let i = 0; i < 100; i++) {
                service.invalidateByKey(`key${i}`);
            }

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 200));

            // Pending count should be low (only debouncing timeouts)
            const pending = service.getPendingCount();
            expect(pending).toBeLessThan(10);
        });

        it('should clear pending on clearPending call', () => {
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');

            service.clearPending();

            const pending = service.getPendingCount();
            expect(pending).toBe(0);
        });
    });

    describe('non-blocking execution', () => {
        it('should not block on invalidation calls', () => {
            const start = Date.now();

            // These should return immediately
            service.invalidateByKey('key1');
            service.invalidateByKey('key2');
            service.invalidateByKey('key3');

            const duration = Date.now() - start;

            // Should complete in less than 10ms (non-blocking)
            expect(duration).toBeLessThan(10);
        });

        it('should process invalidations asynchronously', async () => {
            let processed = false;

            (cacheService.delete as jest.Mock).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                processed = true;
            });

            service.invalidateByKey('key1');

            // Should not be processed immediately
            expect(processed).toBe(false);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(processed).toBe(true);
        });
    });

    describe('error handling', () => {
        it('should log warnings on errors but not throw', async () => {
            (cacheService.delete as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

            // Should not throw
            expect(() => {
                service.invalidateByKey('key1');
            }).not.toThrow();

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = service.getStats();
            expect(stats.failed).toBe(1);
        });

        it('should continue processing after errors', async () => {
            (cacheService.delete as jest.Mock)
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockResolvedValueOnce(true)
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce(true);

            service.invalidateByKey('key1');
            service.invalidateByKey('key2');
            service.invalidateByKey('key3');
            service.invalidateByKey('key4');

            await new Promise(resolve => setTimeout(resolve, 200));

            const stats = service.getStats();
            expect(stats.processed).toBe(2); // 2 successful
            expect(stats.failed).toBe(2); // 2 failed
        });
    });
});
