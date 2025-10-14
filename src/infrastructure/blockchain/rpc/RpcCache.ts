/**
 * RPC Cache using Redis
 * 
 * Implements caching with 1-5 second TTL for hot data
 * 
 * Requirement 11.3: Redis caching with 1-5 second TTL
 */

import Redis from 'ioredis';

interface CacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  redisUrl?: string;
}

export class RpcCache {
  private config: CacheConfig;
  private redis: Redis | null = null;
  private localCache: Map<string, { value: any; expiry: number }>;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  
  constructor(config: CacheConfig) {
    this.config = config;
    this.localCache = new Map();
  }
  
  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    try {
      if (this.config.redisUrl) {
        this.redis = new Redis(this.config.redisUrl, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true
        });
        
        await this.redis.connect();
        console.log('✅ RPC Cache: Redis connected');
      } else {
        console.warn('⚠️  RPC Cache: No Redis URL provided, using in-memory cache');
      }
    } catch (error) {
      console.error('❌ RPC Cache: Failed to connect to Redis:', error);
      this.redis = null;
    }
  }
  
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) {
      return null;
    }
    
    // Try local cache first (faster)
    const localValue = this.getFromLocalCache<T>(key);
    if (localValue !== null) {
      this.cacheHits++;
      return localValue;
    }
    
    // Try Redis cache
    if (this.redis) {
      try {
        const value = await this.redis.get(key);
        
        if (value) {
          this.cacheHits++;
          const parsed = JSON.parse(value) as T;
          
          // Store in local cache for faster subsequent access
          this.setInLocalCache(key, parsed, this.config.ttl);
          
          return parsed;
        }
      } catch (error) {
        console.error('RPC Cache: Redis get error:', error);
      }
    }
    
    this.cacheMisses++;
    return null;
  }
  
  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    
    const cacheTtl = ttl || this.config.ttl;
    
    // Store in local cache
    this.setInLocalCache(key, value, cacheTtl);
    
    // Store in Redis
    if (this.redis) {
      try {
        const serialized = JSON.stringify(value);
        await this.redis.setex(key, cacheTtl, serialized);
      } catch (error) {
        console.error('RPC Cache: Redis set error:', error);
      }
    }
  }
  
  /**
   * Get from local in-memory cache
   */
  private getFromLocalCache<T>(key: string): T | null {
    const cached = this.localCache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > cached.expiry) {
      this.localCache.delete(key);
      return null;
    }
    
    return cached.value as T;
  }
  
  /**
   * Set in local in-memory cache
   */
  private setInLocalCache<T>(key: string, value: T, ttl: number): void {
    const expiry = Date.now() + ttl * 1000;
    this.localCache.set(key, { value, expiry });
    
    // Limit local cache size to prevent memory issues
    if (this.localCache.size > 10000) {
      // Remove oldest entries
      const keysToDelete = Array.from(this.localCache.keys()).slice(0, 1000);
      keysToDelete.forEach(k => this.localCache.delete(k));
    }
  }
  
  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    this.localCache.delete(key);
    
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (error) {
        console.error('RPC Cache: Redis delete error:', error);
      }
    }
  }
  
  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    
    if (this.redis) {
      try {
        // Clear only RPC cache keys (use pattern matching)
        const keys = await this.redis.keys('block:*');
        keys.push(...await this.redis.keys('logs:*'));
        keys.push(...await this.redis.keys('receipt:*'));
        
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        console.error('RPC Cache: Redis clear error:', error);
      }
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    localCacheSize: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      localCacheSize: this.localCache.size
    };
  }
  
  /**
   * Cleanup expired entries from local cache
   */
  private cleanupLocalCache(): void {
    const now = Date.now();
    
    for (const [key, cached] of this.localCache.entries()) {
      if (now > cached.expiry) {
        this.localCache.delete(key);
      }
    }
  }
  
  /**
   * Start periodic cleanup
   */
  startCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => this.cleanupLocalCache(), intervalMs);
  }
  
  /**
   * Shutdown cache
   */
  async shutdown(): Promise<void> {
    this.localCache.clear();
    
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
