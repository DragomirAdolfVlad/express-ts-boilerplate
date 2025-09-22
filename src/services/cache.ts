import { getRedisClient } from './redis';
import { getConfig } from '../config';

/**
 * Cache service with TTL support and key patterns
 */

export interface CacheOptions {
    ttl?: number; // Time to live in seconds
    prefix?: string; // Key prefix
}

export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
}

class CacheService {
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0
    };

    /**
     * Generate cache key with prefix
     */
    private generateKey(key: string, prefix?: string): string {
        const config = getConfig();
        const keyPrefix = prefix || config.redis.keyPrefix;
        return `${keyPrefix}${key}`;
    }

    /**
     * Get value from cache
     */
    async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
        try {
            const client = getRedisClient();
            const cacheKey = this.generateKey(key, options.prefix);
            const value = await client.get(cacheKey);

            if (value === null) {
                this.stats.misses++;
                return null;
            }

            this.stats.hits++;
            return JSON.parse(value) as T;
        } catch (error) {
            console.error('Cache get error:', error);
            this.stats.misses++;
            return null;
        }
    }

    /**
     * Set value in cache with optional TTL
     */
    async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
        try {
            const client = getRedisClient();
            const config = getConfig();
            const cacheKey = this.generateKey(key, options.prefix);
            const serializedValue = JSON.stringify(value);
            const ttl = options.ttl || config.redis.defaultTtl;

            if (ttl > 0) {
                await client.setex(cacheKey, ttl, serializedValue);
            } else {
                await client.set(cacheKey, serializedValue);
            }

            this.stats.sets++;
            return true;
        } catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    }

    /**
     * Delete value from cache
     */
    async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
        try {
            const client = getRedisClient();
            const cacheKey = this.generateKey(key, options.prefix);
            const result = await client.del(cacheKey);

            this.stats.deletes++;
            return result > 0;
        } catch (error) {
            console.error('Cache delete error:', error);
            return false;
        }
    }

    /**
     * Check if key exists in cache
     */
    async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
        try {
            const client = getRedisClient();
            const cacheKey = this.generateKey(key, options.prefix);
            const result = await client.exists(cacheKey);
            return result === 1;
        } catch (error) {
            console.error('Cache exists error:', error);
            return false;
        }
    }

    /**
     * Get TTL for a key
     */
    async getTTL(key: string, options: CacheOptions = {}): Promise<number> {
        try {
            const client = getRedisClient();
            const cacheKey = this.generateKey(key, options.prefix);
            return await client.ttl(cacheKey);
        } catch (error) {
            console.error('Cache TTL error:', error);
            return -1;
        }
    }

    /**
     * Set TTL for existing key
     */
    async setTTL(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
        try {
            const client = getRedisClient();
            const cacheKey = this.generateKey(key, options.prefix);
            const result = await client.expire(cacheKey, ttl);
            return result === 1;
        } catch (error) {
            console.error('Cache set TTL error:', error);
            return false;
        }
    }

    /**
     * Get multiple values from cache
     */
    async getMany<T = any>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
        try {
            const client = getRedisClient();
            const cacheKeys = keys.map(key => this.generateKey(key, options.prefix));
            const values = await client.mget(...cacheKeys);

            return values.map(value => {
                if (value === null) {
                    this.stats.misses++;
                    return null;
                }
                this.stats.hits++;
                return JSON.parse(value) as T;
            });
        } catch (error) {
            console.error('Cache getMany error:', error);
            this.stats.misses += keys.length;
            return keys.map(() => null);
        }
    }

    /**
     * Set multiple values in cache
     */
    async setMany(keyValuePairs: Record<string, any>, options: CacheOptions = {}): Promise<boolean> {
        try {
            const client = getRedisClient();
            const config = getConfig();
            const ttl = options.ttl || config.redis.defaultTtl;

            const pipeline = client.pipeline();

            Object.entries(keyValuePairs).forEach(([key, value]) => {
                const cacheKey = this.generateKey(key, options.prefix);
                const serializedValue = JSON.stringify(value);

                if (ttl > 0) {
                    pipeline.setex(cacheKey, ttl, serializedValue);
                } else {
                    pipeline.set(cacheKey, serializedValue);
                }
            });

            await pipeline.exec();
            this.stats.sets += Object.keys(keyValuePairs).length;
            return true;
        } catch (error) {
            console.error('Cache setMany error:', error);
            return false;
        }
    }

    /**
     * Delete multiple keys from cache
     */
    async deleteMany(keys: string[], options: CacheOptions = {}): Promise<number> {
        try {
            const client = getRedisClient();
            const cacheKeys = keys.map(key => this.generateKey(key, options.prefix));
            const result = await client.del(...cacheKeys);

            this.stats.deletes += result;
            return result;
        } catch (error) {
            console.error('Cache deleteMany error:', error);
            return 0;
        }
    }

    /**
     * Delete keys by pattern
     */
    async deleteByPattern(pattern: string, options: CacheOptions = {}): Promise<number> {
        try {
            const client = getRedisClient();
            const searchPattern = this.generateKey(pattern, options.prefix);
            const keys = await client.keys(searchPattern);

            if (keys.length === 0) {
                return 0;
            }

            const result = await client.del(...keys);
            this.stats.deletes += result;
            return result;
        } catch (error) {
            console.error('Cache deleteByPattern error:', error);
            return 0;
        }
    }

    /**
     * Clear all cache (use with caution)
     */
    async clear(): Promise<boolean> {
        try {
            const client = getRedisClient();
            await client.flushdb();
            return true;
        } catch (error) {
            console.error('Cache clear error:', error);
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Reset cache statistics
     */
    resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    /**
     * Get cache hit ratio
     */
    getHitRatio(): number {
        const total = this.stats.hits + this.stats.misses;
        return total === 0 ? 0 : this.stats.hits / total;
    }
}

// Export singleton instance
export const cacheService = new CacheService();