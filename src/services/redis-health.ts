import { getRedisClient, testRedisConnection } from './redis';
import { cacheService } from './cache';

/**
 * Redis health check and fallback mechanisms
 */

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    error?: string;
    timestamp: number;
    details: {
        connection: boolean;
        ping: boolean;
        memory: boolean;
        operations: boolean;
    };
}

export interface FallbackOptions {
    enableInMemoryFallback: boolean;
    maxMemoryItems: number;
    memoryTtl: number;
}

class RedisHealthService {
    private healthStatus: HealthCheckResult['status'] = 'unhealthy';
    private lastHealthCheck: number = 0;
    private healthCheckInterval: number = 30000; // 30 seconds
    private inMemoryCache = new Map<string, { value: any; expires: number }>();
    private fallbackOptions: FallbackOptions = {
        enableInMemoryFallback: true,
        maxMemoryItems: 1000,
        memoryTtl: 300 // 5 minutes
    };

    /**
     * Perform comprehensive health check
     */
    async performHealthCheck(): Promise<HealthCheckResult> {
        const startTime = Date.now();
        const result: HealthCheckResult = {
            status: 'unhealthy',
            latency: 0,
            timestamp: startTime,
            details: {
                connection: false,
                ping: false,
                memory: false,
                operations: false
            }
        };

        try {
            // Test 1: Connection test
            const connectionTest = await testRedisConnection();
            result.details.connection = connectionTest;

            if (!connectionTest) {
                result.status = 'unhealthy';
                result.error = 'Redis connection failed';
                result.latency = Date.now() - startTime;
                this.healthStatus = result.status;
                return result;
            }

            const client = getRedisClient();

            // Test 2: Ping test
            try {
                await client.ping();
                result.details.ping = true;
            } catch (error) {
                result.details.ping = false;
                result.error = 'Redis ping failed';
            }

            // Test 3: Memory usage check
            try {
                const info = await client.info('memory');
                const memoryUsage = this.parseMemoryInfo(info);
                result.details.memory = memoryUsage.usedMemoryRatio < 0.9; // Less than 90%
            } catch (error) {
                result.details.memory = false;
                result.error = result.error || 'Memory check failed';
            }

            // Test 4: Basic operations test
            try {
                const testKey = `health:check:${Date.now()}`;
                const testValue = 'health-check-value';
                
                await client.set(testKey, testValue, 'EX', 10);
                const retrievedValue = await client.get(testKey);
                await client.del(testKey);
                
                result.details.operations = retrievedValue === testValue;
            } catch (error) {
                result.details.operations = false;
                result.error = result.error || 'Operations test failed';
            }

            // Determine overall status
            const healthyChecks = Object.values(result.details).filter(Boolean).length;
            if (healthyChecks === 4) {
                result.status = 'healthy';
            } else if (healthyChecks >= 2) {
                result.status = 'degraded';
            } else {
                result.status = 'unhealthy';
            }

        } catch (error) {
            result.status = 'unhealthy';
            result.error = error instanceof Error ? error.message : 'Unknown error';
        }

        result.latency = Date.now() - startTime;
        this.healthStatus = result.status;
        this.lastHealthCheck = Date.now();

        console.log(`🏥 Redis health check: ${result.status} (${result.latency}ms)`);
        return result;
    }

    /**
     * Parse memory info from Redis INFO command
     */
    private parseMemoryInfo(info: string): { usedMemory: number; maxMemory: number; usedMemoryRatio: number } {
        const lines = info.split('\r\n');
        let usedMemory = 0;
        let maxMemory = 0;

        for (const line of lines) {
            if (line.startsWith('used_memory:')) {
                const value = line.split(':')[1];
                if (value) usedMemory = parseInt(value);
            } else if (line.startsWith('maxmemory:')) {
                const value = line.split(':')[1];
                if (value) maxMemory = parseInt(value);
            }
        }

        const usedMemoryRatio = maxMemory > 0 ? usedMemory / maxMemory : 0;
        return { usedMemory, maxMemory, usedMemoryRatio };
    }

    /**
     * Get current health status
     */
    getHealthStatus(): HealthCheckResult['status'] {
        return this.healthStatus;
    }

    /**
     * Get last health check timestamp
     */
    getLastHealthCheck(): number {
        return this.lastHealthCheck;
    }

    /**
     * Check if Redis is available
     */
    isRedisAvailable(): boolean {
        return this.healthStatus === 'healthy' || this.healthStatus === 'degraded';
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks(): void {
        // Initial health check
        this.performHealthCheck();

        // Periodic health checks
        setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckInterval);

        console.log(`🏥 Started Redis health checks (interval: ${this.healthCheckInterval}ms)`);
    }

    /**
     * Configure fallback options
     */
    configureFallback(options: Partial<FallbackOptions>): void {
        this.fallbackOptions = { ...this.fallbackOptions, ...options };
        console.log('🔄 Redis fallback options configured:', this.fallbackOptions);
    }

    /**
     * In-memory cache fallback - Get
     */
    async fallbackGet<T = any>(key: string): Promise<T | null> {
        if (!this.fallbackOptions.enableInMemoryFallback) {
            return null;
        }

        const item = this.inMemoryCache.get(key);
        if (!item) {
            return null;
        }

        if (Date.now() > item.expires) {
            this.inMemoryCache.delete(key);
            return null;
        }

        console.log(`💾 Fallback cache hit: ${key}`);
        return item.value as T;
    }

    /**
     * In-memory cache fallback - Set
     */
    async fallbackSet(key: string, value: any, ttl?: number): Promise<boolean> {
        if (!this.fallbackOptions.enableInMemoryFallback) {
            return false;
        }

        // Clean up expired items if cache is full
        if (this.inMemoryCache.size >= this.fallbackOptions.maxMemoryItems) {
            this.cleanupExpiredItems();
        }

        // If still full, remove oldest items
        if (this.inMemoryCache.size >= this.fallbackOptions.maxMemoryItems) {
            const oldestKey = this.inMemoryCache.keys().next().value;
            if (oldestKey) {
                this.inMemoryCache.delete(oldestKey);
            }
        }

        const expires = Date.now() + (ttl || this.fallbackOptions.memoryTtl) * 1000;
        this.inMemoryCache.set(key, { value, expires });

        console.log(`💾 Fallback cache set: ${key}`);
        return true;
    }

    /**
     * In-memory cache fallback - Delete
     */
    async fallbackDelete(key: string): Promise<boolean> {
        if (!this.fallbackOptions.enableInMemoryFallback) {
            return false;
        }

        const deleted = this.inMemoryCache.delete(key);
        if (deleted) {
            console.log(`💾 Fallback cache delete: ${key}`);
        }
        return deleted;
    }

    /**
     * Clean up expired items from in-memory cache
     */
    private cleanupExpiredItems(): void {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, item] of this.inMemoryCache.entries()) {
            if (now > item.expires) {
                this.inMemoryCache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired fallback cache items`);
        }
    }

    /**
     * Get fallback cache statistics
     */
    getFallbackStats(): { size: number; maxSize: number; hitRatio: number } {
        return {
            size: this.inMemoryCache.size,
            maxSize: this.fallbackOptions.maxMemoryItems,
            hitRatio: 0 // Would need to track hits/misses for accurate ratio
        };
    }

    /**
     * Clear fallback cache
     */
    clearFallbackCache(): void {
        this.inMemoryCache.clear();
        console.log('🧹 Fallback cache cleared');
    }

    /**
     * Enhanced cache service with fallback
     */
    async getWithFallback<T = any>(key: string): Promise<T | null> {
        try {
            if (this.isRedisAvailable()) {
                return await cacheService.get<T>(key);
            }
        } catch (error) {
            console.warn(`Redis get failed for key ${key}, using fallback:`, error);
        }

        return await this.fallbackGet<T>(key);
    }

    /**
     * Enhanced cache service with fallback
     */
    async setWithFallback(key: string, value: any, ttl?: number): Promise<boolean> {
        let redisSuccess = false;

        try {
            if (this.isRedisAvailable()) {
                const options = ttl !== undefined ? { ttl } : {};
                redisSuccess = await cacheService.set(key, value, options);
            }
        } catch (error) {
            console.warn(`Redis set failed for key ${key}, using fallback:`, error);
        }

        if (!redisSuccess) {
            return await this.fallbackSet(key, value, ttl);
        }

        return redisSuccess;
    }

    /**
     * Enhanced cache service with fallback
     */
    async deleteWithFallback(key: string): Promise<boolean> {
        let redisSuccess = false;

        try {
            if (this.isRedisAvailable()) {
                redisSuccess = await cacheService.delete(key);
            }
        } catch (error) {
            console.warn(`Redis delete failed for key ${key}, using fallback:`, error);
        }

        const fallbackSuccess = await this.fallbackDelete(key);
        return redisSuccess || fallbackSuccess;
    }
}

// Export singleton instance
export const redisHealthService = new RedisHealthService();