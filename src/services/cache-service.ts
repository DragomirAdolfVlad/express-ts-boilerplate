/**
 * Cache service wrapper with enhanced functionality
 */

import { cacheService as baseCacheService, CacheOptions } from './cache';
import { log, LogContext } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

/**
 * Enhanced cache service with logging and error handling
 */
export class CacheService {
    private readonly baseService = baseCacheService;

    /**
     * Get value from cache with logging
     */
    async get<T = any>(key: string, options: CacheOptions = {}, context?: LogContext): Promise<T | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache get operation', { key, options });
            
            const result = await this.baseService.get<T>(key, options);
            
            if (result !== null) {
                logger.debug('Cache hit', { key });
            } else {
                logger.debug('Cache miss', { key });
            }
            
            return result;

        } catch (error) {
            logger.error('Cache get operation failed', { 
                key, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            // Return null on cache errors to allow fallback to primary data source
            return null;
        }
    }

    /**
     * Set value in cache with logging
     */
    async set(key: string, value: any, options: CacheOptions = {}, context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache set operation', { key, options, hasValue: value !== undefined });
            
            const result = await this.baseService.set(key, value, options);
            
            if (result) {
                logger.debug('Cache set successful', { key });
            } else {
                logger.warn('Cache set failed', { key });
            }
            
            return result;

        } catch (error) {
            logger.error('Cache set operation failed', { 
                key, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            // Return false on cache errors
            return false;
        }
    }

    /**
     * Delete value from cache with logging
     */
    async delete(key: string, options: CacheOptions = {}, context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache delete operation', { key, options });
            
            const result = await this.baseService.delete(key, options);
            
            logger.debug('Cache delete result', { key, deleted: result });
            
            return result;

        } catch (error) {
            logger.error('Cache delete operation failed', { 
                key, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return false;
        }
    }

    /**
     * Check if key exists in cache
     */
    async exists(key: string, options: CacheOptions = {}, context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache exists check', { key });
            
            const result = await this.baseService.exists(key, options);
            
            logger.debug('Cache exists result', { key, exists: result });
            
            return result;

        } catch (error) {
            logger.error('Cache exists check failed', { 
                key, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return false;
        }
    }

    /**
     * Get multiple values from cache
     */
    async getMany<T = any>(keys: string[], options: CacheOptions = {}, context?: LogContext): Promise<(T | null)[]> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache getMany operation', { keys, count: keys.length });
            
            const results = await this.baseService.getMany<T>(keys, options);
            
            const hits = results.filter(r => r !== null).length;
            const misses = results.length - hits;
            
            logger.debug('Cache getMany results', { 
                total: keys.length, 
                hits, 
                misses,
                hitRatio: hits / keys.length 
            });
            
            return results;

        } catch (error) {
            logger.error('Cache getMany operation failed', { 
                keys, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return keys.map(() => null);
        }
    }

    /**
     * Set multiple values in cache
     */
    async setMany(keyValuePairs: Record<string, any>, options: CacheOptions = {}, context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            const keys = Object.keys(keyValuePairs);
            logger.debug('Cache setMany operation', { keys, count: keys.length });
            
            const result = await this.baseService.setMany(keyValuePairs, options);
            
            logger.debug('Cache setMany result', { keys, success: result });
            
            return result;

        } catch (error) {
            logger.error('Cache setMany operation failed', { 
                keys: Object.keys(keyValuePairs), 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return false;
        }
    }

    /**
     * Delete multiple keys from cache
     */
    async deleteMany(keys: string[], options: CacheOptions = {}, context?: LogContext): Promise<number> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache deleteMany operation', { keys, count: keys.length });
            
            const result = await this.baseService.deleteMany(keys, options);
            
            logger.debug('Cache deleteMany result', { keys, deletedCount: result });
            
            return result;

        } catch (error) {
            logger.error('Cache deleteMany operation failed', { 
                keys, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return 0;
        }
    }

    /**
     * Delete keys by pattern
     */
    async deleteByPattern(pattern: string, options: CacheOptions = {}, context?: LogContext): Promise<number> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Cache deleteByPattern operation', { pattern });
            
            const result = await this.baseService.deleteByPattern(pattern, options);
            
            logger.debug('Cache deleteByPattern result', { pattern, deletedCount: result });
            
            return result;

        } catch (error) {
            logger.error('Cache deleteByPattern operation failed', { 
                pattern, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats(context?: LogContext): any {
        const logger = log.child(context || {});
        
        try {
            const stats = this.baseService.getStats();
            
            logger.debug('Cache statistics retrieved', { stats });
            
            return {
                ...stats,
                hitRatio: this.baseService.getHitRatio(),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to get cache statistics', { 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            throw new InternalServerError('Failed to get cache statistics', context);
        }
    }

    /**
     * Clear all cache
     */
    async clear(context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            logger.warn('Clearing all cache - this is a destructive operation');
            
            const result = await this.baseService.clear();
            
            if (result) {
                logger.warn('All cache cleared successfully');
            } else {
                logger.error('Failed to clear cache');
            }
            
            return result;

        } catch (error) {
            logger.error('Cache clear operation failed', { 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return false;
        }
    }

    /**
     * Get or set pattern - get from cache, or set if not exists
     */
    async getOrSet<T>(
        key: string, 
        factory: () => Promise<T>, 
        options: CacheOptions = {},
        context?: LogContext
    ): Promise<T> {
        const logger = log.child(context || {});
        
        try {
            // Try to get from cache first
            const cached = await this.get<T>(key, options, context);
            
            if (cached !== null) {
                logger.debug('Cache hit for getOrSet', { key });
                return cached;
            }

            // Cache miss - generate value
            logger.debug('Cache miss for getOrSet, generating value', { key });
            
            const value = await factory();
            
            // Set in cache
            await this.set(key, value, options, context);
            
            logger.debug('Value generated and cached', { key });
            
            return value;

        } catch (error) {
            logger.error('GetOrSet operation failed', { 
                key, 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            throw new InternalServerError('Cache getOrSet operation failed', context);
        }
    }
}

// Export singleton instance
export const enhancedCacheService = new CacheService();