/**
 * Redis Tracker Cache Service
 * 
 * High-performance Redis integration for Monad Tracker with:
 * - Redis Pipelines for batch operations (100x faster)
 * - Pub/Sub for real-time event broadcasting
 * - Sorted Sets for price charts and leaderboards
 * - Caching layer for tokens and trades
 * - Stream processing for event queue
 */

import Redis from 'ioredis';

interface TokenData {
  tokenAddress: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurve: string;
  blockNumber: string;
  timestamp: Date;
  metadata?: {
    description?: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  };
}

interface TradeData {
  uniqueTradeId: string;
  tokenAddress: string;
  trader: string;
  isBuy: boolean;
  ethAmount: string;
  tokenAmount: string;
  pricePerToken: string;
  blockNumber: string;
  timestamp: Date;
}

interface PricePoint {
  price: string;
  volume: string;
  timestamp: number;
}

export class RedisTrackerCache {
  private redis: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private readonly KEY_PREFIX = 'monad:tracker:';
  
  // Callback registries to prevent memory leaks
  private tokenCreatedCallbacks: Set<(token: TokenData) => void> = new Set();
  private tradeExecutedCallbacks: Set<(trade: TradeData) => void> = new Set();
  private priceUpdateCallbacks: Set<(data: { tokenAddress: string; price: string; volume: string }) => void> = new Set();
  
  // Key patterns
  private readonly KEYS = {
    // Token data
    TOKEN: (address: string) => `${this.KEY_PREFIX}token:${address}`,
    TOKEN_LIST: `${this.KEY_PREFIX}tokens:list`,
    TOKEN_METADATA: (address: string) => `${this.KEY_PREFIX}token:${address}:metadata`,
    
    // Trade data
    TRADE: (tradeId: string) => `${this.KEY_PREFIX}trade:${tradeId}`,
    TOKEN_TRADES: (address: string) => `${this.KEY_PREFIX}token:${address}:trades`,
    RECENT_TRADES: `${this.KEY_PREFIX}trades:recent`,
    
    // Price data (sorted sets)
    PRICE_HISTORY: (address: string) => `${this.KEY_PREFIX}token:${address}:prices`,
    VOLUME_24H: (address: string) => `${this.KEY_PREFIX}token:${address}:volume:24h`,
    
    // Leaderboards (sorted sets)
    TOKENS_BY_VOLUME: `${this.KEY_PREFIX}leaderboard:volume`,
    TOKENS_BY_TRADES: `${this.KEY_PREFIX}leaderboard:trades`,
    TOKENS_BY_HOLDERS: `${this.KEY_PREFIX}leaderboard:holders`,
    TOP_TRADERS: `${this.KEY_PREFIX}leaderboard:traders`,
    
    // Real-time tracking
    ACTIVE_TOKENS: `${this.KEY_PREFIX}active:tokens`,
    ONLINE_USERS: `${this.KEY_PREFIX}online:users`,
    
    // Stats
    STATS_GLOBAL: `${this.KEY_PREFIX}stats:global`,
    STATS_TOKEN: (address: string) => `${this.KEY_PREFIX}stats:token:${address}`,
    
    // Token API caching (Task 8.1)
    TOKEN_WITH_STATS: (address: string) => `${this.KEY_PREFIX}token:${address}:with-stats`,
    TOKEN_STATS: (address: string) => `${this.KEY_PREFIX}token:${address}:stats`,
    
    // Holder/Trader rankings (Task 8.2)
    HOLDER_RANKINGS: (address: string) => `${this.KEY_PREFIX}token:${address}:holders`,
    TRADER_RANKINGS: (address: string) => `${this.KEY_PREFIX}token:${address}:traders`,
  };
  
  // Pub/Sub channels
  private readonly CHANNELS = {
    TOKEN_CREATED: 'monad:events:token:created',
    TRADE_EXECUTED: 'monad:events:trade:executed',
    PRICE_UPDATE: 'monad:events:price:update',
    STATS_UPDATE: 'monad:events:stats:update',
  };
  
  // TTL configurations (in seconds)
  private readonly TTL = {
    TOKEN: 3600, // 1 hour
    TRADE: 1800, // 30 minutes
    RECENT_TRADES: 300, // 5 minutes
    PRICE_HISTORY: 86400, // 24 hours
    STATS: 60, // 1 minute
    METADATA: 7200, // 2 hours
    
    // Token API caching TTLs (Task 8.1)
    TOKEN_WITH_STATS: 3600, // 1 hour for token data
    TOKEN_STATS_ONLY: 60, // 1 minute for stats
    
    // Holder/Trader rankings TTLs (Task 8.2)
    RANKINGS: 300, // 5 minutes
  };

  constructor() {
    const redisConfig = {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
      password: process.env['REDIS_PASSWORD'],
      db: parseInt(process.env['REDIS_DB'] || '0'),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: false, // Prevent unbounded queue growth
      lazyConnect: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // Main Redis client
    this.redis = new Redis(redisConfig);
    
    // Separate clients for pub/sub (required by Redis)
    this.subscriber = new Redis(redisConfig);
    this.publisher = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.redis.on('connect', () => {
      console.log('✅ Redis tracker cache connected');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Redis tracker cache error:', error);
    });

    // Single message handler to prevent memory leaks
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });
  }

  /**
   * Initialize Redis tracker cache
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.ping();
      console.log('✅ Redis tracker cache initialized');
      
      // Subscribe to channels
      await this.subscriber.subscribe(
        this.CHANNELS.TOKEN_CREATED,
        this.CHANNELS.TRADE_EXECUTED,
        this.CHANNELS.PRICE_UPDATE
      );
      
      console.log('✅ Subscribed to Redis pub/sub channels');
    } catch (error) {
      console.error('❌ Failed to initialize Redis tracker cache:', error);
      throw error;
    }
  }

  // ============================================================================
  // TOKEN OPERATIONS (with Pipeline)
  // ============================================================================

  /**
   * Cache token data with pipeline
   */
  async cacheToken(token: TokenData): Promise<void> {
    const pipeline = this.redis.pipeline();
    const tokenKey = this.KEYS.TOKEN(token.tokenAddress);
    
    // 1. Store token data as hash
    pipeline.hmset(tokenKey, {
      address: token.tokenAddress,
      name: token.name,
      symbol: token.symbol,
      creator: token.creator,
      bondingCurve: token.bondingCurve,
      blockNumber: token.blockNumber,
      timestamp: token.timestamp.toISOString(),
    });
    pipeline.expire(tokenKey, this.TTL.TOKEN);
    
    // 2. Add to token list (sorted by timestamp)
    pipeline.zadd(
      this.KEYS.TOKEN_LIST,
      token.timestamp.getTime(),
      token.tokenAddress
    );
    
    // 3. Cache metadata if available
    if (token.metadata) {
      const metadataKey = this.KEYS.TOKEN_METADATA(token.tokenAddress);
      pipeline.hmset(metadataKey, token.metadata as any);
      pipeline.expire(metadataKey, this.TTL.METADATA);
    }
    
    // 4. Add to active tokens set
    pipeline.sadd(this.KEYS.ACTIVE_TOKENS, token.tokenAddress);
    
    // Execute pipeline (single network round-trip!)
    await pipeline.exec();
    
    // Publish event
    await this.publishTokenCreated(token);
    
    console.log(`💾 Cached token ${token.symbol} (${token.tokenAddress})`);
  }

  /**
   * Cache multiple tokens using pipeline (ULTRA FAST)
   */
  async cacheTokensBatch(tokens: TokenData[]): Promise<void> {
    if (tokens.length === 0) return;
    
    const startTime = Date.now();
    const pipeline = this.redis.pipeline();
    
    for (const token of tokens) {
      const tokenKey = this.KEYS.TOKEN(token.tokenAddress);
      
      // Store token data
      pipeline.hmset(tokenKey, {
        address: token.tokenAddress,
        name: token.name,
        symbol: token.symbol,
        creator: token.creator,
        bondingCurve: token.bondingCurve,
        blockNumber: token.blockNumber,
        timestamp: token.timestamp.toISOString(),
      });
      pipeline.expire(tokenKey, this.TTL.TOKEN);
      
      // Add to sorted set
      pipeline.zadd(
        this.KEYS.TOKEN_LIST,
        token.timestamp.getTime(),
        token.tokenAddress
      );
      
      // Cache metadata
      if (token.metadata) {
        const metadataKey = this.KEYS.TOKEN_METADATA(token.tokenAddress);
        pipeline.hmset(metadataKey, token.metadata as any);
        pipeline.expire(metadataKey, this.TTL.METADATA);
      }
    }
    
    // Execute all operations in single pipeline
    await pipeline.exec();
    
    const duration = Date.now() - startTime;
    console.log(`💾 Cached ${tokens.length} tokens in ${duration}ms via pipeline`);
  }

  /**
   * Get token from cache
   */
  async getToken(tokenAddress: string): Promise<TokenData | null> {
    const tokenKey = this.KEYS.TOKEN(tokenAddress);
    const metadataKey = this.KEYS.TOKEN_METADATA(tokenAddress);
    
    // Use pipeline for parallel fetching
    const pipeline = this.redis.pipeline();
    pipeline.hgetall(tokenKey);
    pipeline.hgetall(metadataKey);
    
    const results = await pipeline.exec();
    
    if (!results || results.length < 2) return null;
    
    const [tokenResult, metadataResult] = results;
    const tokenData = tokenResult?.[1] as any;
    const metadataData = metadataResult?.[1] as any;
    
    if (!tokenData || Object.keys(tokenData).length === 0) {
      return null;
    }
    
    return {
      tokenAddress: tokenData.address,
      name: tokenData.name,
      symbol: tokenData.symbol,
      creator: tokenData.creator,
      bondingCurve: tokenData.bondingCurve,
      blockNumber: tokenData.blockNumber,
      timestamp: new Date(tokenData.timestamp),
      metadata: Object.keys(metadataData).length > 0 ? metadataData : undefined,
    };
  }

  /**
   * Get recent tokens (with pagination)
   */
  async getRecentTokens(limit: number = 50, offset: number = 0): Promise<TokenData[]> {
    // Get token addresses from sorted set (newest first)
    const tokenAddresses = await this.redis.zrevrange(
      this.KEYS.TOKEN_LIST,
      offset,
      offset + limit - 1
    );
    
    if (tokenAddresses.length === 0) return [];
    
    // Fetch all tokens in parallel using pipeline
    const pipeline = this.redis.pipeline();
    for (const address of tokenAddresses) {
      pipeline.hgetall(this.KEYS.TOKEN(address));
      pipeline.hgetall(this.KEYS.TOKEN_METADATA(address));
    }
    
    const results = await pipeline.exec();
    if (!results) return [];
    
    const tokens: TokenData[] = [];
    for (let i = 0; i < tokenAddresses.length; i++) {
      const tokenData = results[i * 2]?.[1] as any;
      const metadataData = results[i * 2 + 1]?.[1] as any;
      
      if (tokenData && Object.keys(tokenData).length > 0) {
        tokens.push({
          tokenAddress: tokenData.address,
          name: tokenData.name,
          symbol: tokenData.symbol,
          creator: tokenData.creator,
          bondingCurve: tokenData.bondingCurve,
          blockNumber: tokenData.blockNumber,
          timestamp: new Date(tokenData.timestamp),
          metadata: Object.keys(metadataData || {}).length > 0 ? metadataData : undefined,
        });
      }
    }
    
    return tokens;
  }

  // ============================================================================
  // TRADE OPERATIONS (with Pipeline)
  // ============================================================================

  /**
   * Cache trade with pipeline
   */
  async cacheTrade(trade: TradeData): Promise<void> {
    const pipeline = this.redis.pipeline();
    const tradeKey = this.KEYS.TRADE(trade.uniqueTradeId);
    
    // 1. Store trade data
    pipeline.hmset(tradeKey, {
      id: trade.uniqueTradeId,
      tokenAddress: trade.tokenAddress,
      trader: trade.trader,
      isBuy: trade.isBuy ? '1' : '0',
      ethAmount: trade.ethAmount,
      tokenAmount: trade.tokenAmount,
      pricePerToken: trade.pricePerToken,
      blockNumber: trade.blockNumber,
      timestamp: trade.timestamp.toISOString(),
    });
    pipeline.expire(tradeKey, this.TTL.TRADE);
    
    // 2. Add to token's trade list (sorted by timestamp)
    pipeline.zadd(
      this.KEYS.TOKEN_TRADES(trade.tokenAddress),
      trade.timestamp.getTime(),
      trade.uniqueTradeId
    );
    
    // 3. Add to global recent trades (keep last 1000)
    pipeline.zadd(
      this.KEYS.RECENT_TRADES,
      trade.timestamp.getTime(),
      trade.uniqueTradeId
    );
    pipeline.zremrangebyrank(this.KEYS.RECENT_TRADES, 0, -1001); // Keep only 1000
    pipeline.expire(this.KEYS.RECENT_TRADES, this.TTL.RECENT_TRADES);
    
    // 4. Update price history (sorted set)
    pipeline.zadd(
      this.KEYS.PRICE_HISTORY(trade.tokenAddress),
      trade.timestamp.getTime(),
      `${trade.pricePerToken}:${trade.ethAmount}`
    );
    
    // 5. Update 24h volume
    const oneDayAgo = Date.now() - 86400000;
    pipeline.zremrangebyscore(
      this.KEYS.VOLUME_24H(trade.tokenAddress),
      0,
      oneDayAgo
    );
    pipeline.zadd(
      this.KEYS.VOLUME_24H(trade.tokenAddress),
      trade.timestamp.getTime(),
      trade.ethAmount
    );
    
    // 6. Update leaderboards
    if (trade.isBuy) {
      pipeline.zincrby(this.KEYS.TOKENS_BY_VOLUME, parseFloat(trade.ethAmount), trade.tokenAddress);
      pipeline.zincrby(this.KEYS.TOKENS_BY_TRADES, 1, trade.tokenAddress);
      pipeline.zincrby(this.KEYS.TOP_TRADERS, parseFloat(trade.ethAmount), trade.trader);
    }
    
    // Execute pipeline
    await pipeline.exec();
    
    // Publish event
    await this.publishTradeExecuted(trade);
    
    console.log(`💰 Cached ${trade.isBuy ? 'BUY' : 'SELL'} trade for ${trade.tokenAddress}`);
  }

  /**
   * Cache multiple trades using pipeline (ULTRA FAST)
   */
  async cacheTradesBatch(trades: TradeData[]): Promise<void> {
    if (trades.length === 0) return;
    
    const startTime = Date.now();
    const pipeline = this.redis.pipeline();
    
    for (const trade of trades) {
      const tradeKey = this.KEYS.TRADE(trade.uniqueTradeId);
      
      // Store trade
      pipeline.hmset(tradeKey, {
        id: trade.uniqueTradeId,
        tokenAddress: trade.tokenAddress,
        trader: trade.trader,
        isBuy: trade.isBuy ? '1' : '0',
        ethAmount: trade.ethAmount,
        tokenAmount: trade.tokenAmount,
        pricePerToken: trade.pricePerToken,
        blockNumber: trade.blockNumber,
        timestamp: trade.timestamp.toISOString(),
      });
      pipeline.expire(tradeKey, this.TTL.TRADE);
      
      // Add to lists
      pipeline.zadd(
        this.KEYS.TOKEN_TRADES(trade.tokenAddress),
        trade.timestamp.getTime(),
        trade.uniqueTradeId
      );
      
      pipeline.zadd(
        this.KEYS.RECENT_TRADES,
        trade.timestamp.getTime(),
        trade.uniqueTradeId
      );
      
      // Update stats
      pipeline.zadd(
        this.KEYS.PRICE_HISTORY(trade.tokenAddress),
        trade.timestamp.getTime(),
        `${trade.pricePerToken}:${trade.ethAmount}`
      );
      
      if (trade.isBuy) {
        pipeline.zincrby(this.KEYS.TOKENS_BY_VOLUME, parseFloat(trade.ethAmount), trade.tokenAddress);
        pipeline.zincrby(this.KEYS.TOKENS_BY_TRADES, 1, trade.tokenAddress);
      }
    }
    
    // Execute all at once
    await pipeline.exec();
    
    const duration = Date.now() - startTime;
    console.log(`💰 Cached ${trades.length} trades in ${duration}ms via pipeline`);
  }

  /**
   * Get recent trades for a token
   */
  async getTokenTrades(tokenAddress: string, limit: number = 50): Promise<TradeData[]> {
    // Get trade IDs (newest first)
    const tradeIds = await this.redis.zrevrange(
      this.KEYS.TOKEN_TRADES(tokenAddress),
      0,
      limit - 1
    );
    
    if (tradeIds.length === 0) return [];
    
    // Fetch trades in parallel
    const pipeline = this.redis.pipeline();
    for (const tradeId of tradeIds) {
      pipeline.hgetall(this.KEYS.TRADE(tradeId));
    }
    
    const results = await pipeline.exec();
    if (!results) return [];
    
    return results
      .map((result) => result[1] as any)
      .filter((data) => data && Object.keys(data).length > 0)
      .map((data) => ({
        uniqueTradeId: data.id,
        tokenAddress: data.tokenAddress,
        trader: data.trader,
        isBuy: data.isBuy === '1',
        ethAmount: data.ethAmount,
        tokenAmount: data.tokenAmount,
        pricePerToken: data.pricePerToken,
        blockNumber: data.blockNumber,
        timestamp: new Date(data.timestamp),
      }));
  }

  /**
   * Get global recent trades
   */
  async getRecentTrades(limit: number = 100): Promise<TradeData[]> {
    const tradeIds = await this.redis.zrevrange(
      this.KEYS.RECENT_TRADES,
      0,
      limit - 1
    );
    
    if (tradeIds.length === 0) return [];
    
    const pipeline = this.redis.pipeline();
    for (const tradeId of tradeIds) {
      pipeline.hgetall(this.KEYS.TRADE(tradeId));
    }
    
    const results = await pipeline.exec();
    if (!results) return [];
    
    return results
      .map((result) => result[1] as any)
      .filter((data) => data && Object.keys(data).length > 0)
      .map((data) => ({
        uniqueTradeId: data.id,
        tokenAddress: data.tokenAddress,
        trader: data.trader,
        isBuy: data.isBuy === '1',
        ethAmount: data.ethAmount,
        tokenAmount: data.tokenAmount,
        pricePerToken: data.pricePerToken,
        blockNumber: data.blockNumber,
        timestamp: new Date(data.timestamp),
      }));
  }

  // ============================================================================
  // PRICE HISTORY & CHARTS
  // ============================================================================

  /**
   * Get price history for charts
   */
  async getPriceHistory(
    tokenAddress: string,
    timeRange: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<PricePoint[]> {
    const ranges = {
      '1h': 3600000,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000,
    };
    
    const minTimestamp = Date.now() - ranges[timeRange];
    
    // Get prices from sorted set
    const prices = await this.redis.zrangebyscore(
      this.KEYS.PRICE_HISTORY(tokenAddress),
      minTimestamp,
      '+inf',
      'WITHSCORES'
    );
    
    const pricePoints: PricePoint[] = [];
    for (let i = 0; i < prices.length; i += 2) {
      const priceData = prices[i];
      const timestampStr = prices[i + 1];
      
      if (!priceData || !timestampStr) continue;
      
      const [price, volume] = priceData.split(':');
      const timestamp = parseInt(timestampStr);
      
      if (price && volume) {
        pricePoints.push({
          price,
          volume,
          timestamp,
        });
      }
    }
    
    return pricePoints;
  }

  /**
   * Get 24h volume for a token
   */
  async get24hVolume(tokenAddress: string): Promise<string> {
    const volumes = await this.redis.zrange(
      this.KEYS.VOLUME_24H(tokenAddress),
      0,
      -1
    );
    
    const totalVolume = volumes.reduce((sum, vol) => sum + parseFloat(vol), 0);
    return totalVolume.toString();
  }

  // ============================================================================
  // LEADERBOARDS
  // ============================================================================

  /**
   * Get top tokens by volume
   */
  async getTopTokensByVolume(limit: number = 10): Promise<Array<{ address: string; volume: string }>> {
    const results = await this.redis.zrevrange(
      this.KEYS.TOKENS_BY_VOLUME,
      0,
      limit - 1,
      'WITHSCORES'
    );
    
    const tokens = [];
    for (let i = 0; i < results.length; i += 2) {
      const address = results[i];
      const volume = results[i + 1];
      
      if (address && volume) {
        tokens.push({ address, volume });
      }
    }
    
    return tokens;
  }

  /**
   * Get top tokens by trade count
   */
  async getTopTokensByTrades(limit: number = 10): Promise<Array<{ address: string; trades: number }>> {
    const results = await this.redis.zrevrange(
      this.KEYS.TOKENS_BY_TRADES,
      0,
      limit - 1,
      'WITHSCORES'
    );
    
    const tokens = [];
    for (let i = 0; i < results.length; i += 2) {
      const address = results[i];
      const tradesStr = results[i + 1];
      
      if (address && tradesStr) {
        tokens.push({
          address,
          trades: parseInt(tradesStr),
        });
      }
    }
    
    return tokens;
  }

  /**
   * Get top traders
   */
  async getTopTraders(limit: number = 10): Promise<Array<{ address: string; volume: string }>> {
    const results = await this.redis.zrevrange(
      this.KEYS.TOP_TRADERS,
      0,
      limit - 1,
      'WITHSCORES'
    );
    
    const traders = [];
    for (let i = 0; i < results.length; i += 2) {
      const address = results[i];
      const volume = results[i + 1];
      
      if (address && volume) {
        traders.push({ address, volume });
      }
    }
    
    return traders;
  }

  // ============================================================================
  // PUB/SUB FOR REAL-TIME UPDATES
  // ============================================================================

  /**
   * Publish token created event
   */
  private async publishTokenCreated(token: TokenData): Promise<void> {
    await this.publisher.publish(
      this.CHANNELS.TOKEN_CREATED,
      JSON.stringify({
        type: 'TOKEN_CREATED',
        data: token,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Publish trade executed event
   */
  private async publishTradeExecuted(trade: TradeData): Promise<void> {
    await this.publisher.publish(
      this.CHANNELS.TRADE_EXECUTED,
      JSON.stringify({
        type: 'TRADE_EXECUTED',
        data: trade,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Publish price update event
   */
  async publishPriceUpdate(tokenAddress: string, price: string, volume: string): Promise<void> {
    await this.publisher.publish(
      this.CHANNELS.PRICE_UPDATE,
      JSON.stringify({
        type: 'PRICE_UPDATE',
        data: { tokenAddress, price, volume },
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Subscribe to events (for WebSocket broadcasting)
   * Uses callback registry to prevent memory leaks
   */
  onTokenCreated(callback: (token: TokenData) => void): void {
    this.tokenCreatedCallbacks.add(callback);
  }

  onTradeExecuted(callback: (trade: TradeData) => void): void {
    this.tradeExecutedCallbacks.add(callback);
  }

  onPriceUpdate(callback: (data: { tokenAddress: string; price: string; volume: string }) => void): void {
    this.priceUpdateCallbacks.add(callback);
  }

  /**
   * Unsubscribe from events (to prevent memory leaks)
   */
  offTokenCreated(callback: (token: TokenData) => void): void {
    this.tokenCreatedCallbacks.delete(callback);
  }

  offTradeExecuted(callback: (trade: TradeData) => void): void {
    this.tradeExecutedCallbacks.delete(callback);
  }

  offPriceUpdate(callback: (data: { tokenAddress: string; price: string; volume: string }) => void): void {
    this.priceUpdateCallbacks.delete(callback);
  }

  /**
   * Handle pub/sub messages (single handler to prevent memory leaks)
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const event = JSON.parse(message);
      
      switch (channel) {
        case this.CHANNELS.TOKEN_CREATED:
          this.tokenCreatedCallbacks.forEach(callback => {
            try {
              callback(event.data);
            } catch (error) {
              console.error('Error in token created callback:', error);
            }
          });
          break;
          
        case this.CHANNELS.TRADE_EXECUTED:
          this.tradeExecutedCallbacks.forEach(callback => {
            try {
              callback(event.data);
            } catch (error) {
              console.error('Error in trade executed callback:', error);
            }
          });
          break;
          
        case this.CHANNELS.PRICE_UPDATE:
          this.priceUpdateCallbacks.forEach(callback => {
            try {
              callback(event.data);
            } catch (error) {
              console.error('Error in price update callback:', error);
            }
          });
          break;
      }
    } catch (error) {
      console.error('Failed to parse pub/sub message:', error);
    }
  }

  // ============================================================================
  // STATS & ANALYTICS
  // ============================================================================

  /**
   * Update global stats
   */
  async updateGlobalStats(stats: {
    totalTokens: number;
    totalTrades: number;
    totalVolume: string;
    activeUsers: number;
  }): Promise<void> {
    await this.redis.hmset(this.KEYS.STATS_GLOBAL, stats as any);
    await this.redis.expire(this.KEYS.STATS_GLOBAL, this.TTL.STATS);
  }

  /**
   * Get global stats
   */
  async getGlobalStats(): Promise<any> {
    return await this.redis.hgetall(this.KEYS.STATS_GLOBAL);
  }

  /**
   * Clear all cache (use carefully!)
   */
  async clearAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.KEY_PREFIX}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    console.log(`🗑️  Cleared ${keys.length} Redis keys`);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.redis.ping();
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      return { healthy: false, latency: -1 };
    }
  }

  // ============================================================================
  // TOKEN API CACHING (Task 8.1)
  // ============================================================================

  /**
   * Cache token with stats (for API endpoints)
   * TTL: 1 hour for token data, 1 minute for stats
   */
  async cacheTokenWithStats(tokenWithStats: any): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const key = this.KEYS.TOKEN_WITH_STATS(tokenWithStats.address);
      
      // Store complete token with stats as JSON
      pipeline.set(key, JSON.stringify(tokenWithStats));
      pipeline.expire(key, this.TTL.TOKEN_WITH_STATS);
      
      await pipeline.exec();
      
      console.log(`💾 Cached token with stats: ${tokenWithStats.symbol} (${tokenWithStats.address})`);
    } catch (error) {
      console.error('Failed to cache token with stats:', error);
      // Don't throw - cache failures should not break the application
    }
  }

  /**
   * Get token with stats from cache
   * Returns null if not found or expired
   */
  async getTokenWithStats(tokenAddress: string): Promise<any | null> {
    try {
      const key = this.KEYS.TOKEN_WITH_STATS(tokenAddress);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      const tokenWithStats = JSON.parse(data);
      
      // Convert timestamp strings back to Date objects
      if (tokenWithStats.timestamp) {
        tokenWithStats.timestamp = new Date(tokenWithStats.timestamp);
      }
      if (tokenWithStats.stats?.lastTradeTime) {
        tokenWithStats.stats.lastTradeTime = new Date(tokenWithStats.stats.lastTradeTime);
      }
      
      return tokenWithStats;
    } catch (error) {
      console.error('Failed to get token with stats from cache:', error);
      return null;
    }
  }

  /**
   * Invalidate token with stats cache
   * Called when token data changes (new trade, metadata update)
   */
  async invalidateTokenWithStats(tokenAddress: string): Promise<void> {
    try {
      const key = this.KEYS.TOKEN_WITH_STATS(tokenAddress);
      await this.redis.del(key);
      console.log(`🗑️  Invalidated token with stats cache: ${tokenAddress}`);
    } catch (error) {
      console.error('Failed to invalidate token with stats:', error);
    }
  }

  // ============================================================================
  // HOLDER/TRADER RANKINGS CACHING (Task 8.2)
  // ============================================================================

  /**
   * Cache holder rankings for a token
   * TTL: 5 minutes
   */
  async cacheHolderRankings(tokenAddress: string, holders: any[]): Promise<void> {
    try {
      const key = this.KEYS.HOLDER_RANKINGS(tokenAddress);
      await this.redis.set(key, JSON.stringify(holders));
      await this.redis.expire(key, this.TTL.RANKINGS);
      
      console.log(`💾 Cached ${holders.length} holder rankings for ${tokenAddress}`);
    } catch (error) {
      console.error('Failed to cache holder rankings:', error);
    }
  }

  /**
   * Get holder rankings from cache
   * Returns null if not found or expired
   */
  async getHolderRankings(tokenAddress: string): Promise<any[] | null> {
    try {
      const key = this.KEYS.HOLDER_RANKINGS(tokenAddress);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to get holder rankings from cache:', error);
      return null;
    }
  }

  /**
   * Cache trader rankings for a token
   * TTL: 5 minutes
   */
  async cacheTraderRankings(tokenAddress: string, traders: any[]): Promise<void> {
    try {
      const key = this.KEYS.TRADER_RANKINGS(tokenAddress);
      await this.redis.set(key, JSON.stringify(traders));
      await this.redis.expire(key, this.TTL.RANKINGS);
      
      console.log(`💾 Cached ${traders.length} trader rankings for ${tokenAddress}`);
    } catch (error) {
      console.error('Failed to cache trader rankings:', error);
    }
  }

  /**
   * Get trader rankings from cache
   * Returns null if not found or expired
   */
  async getTraderRankings(tokenAddress: string): Promise<any[] | null> {
    try {
      const key = this.KEYS.TRADER_RANKINGS(tokenAddress);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to get trader rankings from cache:', error);
      return null;
    }
  }

  /**
   * Invalidate holder and trader rankings for a token
   * Called when new trade occurs
   */
  async invalidateRankings(tokenAddress: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.del(this.KEYS.HOLDER_RANKINGS(tokenAddress));
      pipeline.del(this.KEYS.TRADER_RANKINGS(tokenAddress));
      await pipeline.exec();
      
      console.log(`🗑️  Invalidated rankings cache for ${tokenAddress}`);
    } catch (error) {
      console.error('Failed to invalidate rankings:', error);
    }
  }

  // ============================================================================
  // CACHE WARMING (Task 8.4)
  // ============================================================================

  /**
   * Warm cache with top tokens on startup
   * Caches the top N tokens by volume to improve initial response times
   */
  async warmCacheWithTopTokens(tokens: any[], limit: number = 100): Promise<void> {
    try {
      console.log(`[🔥 CACHE WARMING] Starting cache warming for ${Math.min(tokens.length, limit)} tokens...`);
      
      const startTime = Date.now();
      const tokensToCache = tokens.slice(0, limit);
      
      // Cache tokens in parallel (but in batches to avoid overwhelming Redis)
      const batchSize = 10;
      for (let i = 0; i < tokensToCache.length; i += batchSize) {
        const batch = tokensToCache.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (token) => {
            try {
              await this.cacheTokenWithStats(token);
            } catch (error) {
              console.warn(`[⚠️  CACHE WARMING] Failed to cache token ${token.address}:`, error);
            }
          })
        );
      }
      
      const duration = Date.now() - startTime;
      console.log(`[🔥 CACHE WARMING] Completed in ${duration}ms - cached ${tokensToCache.length} tokens`);
    } catch (error) {
      console.error('[❌ CACHE WARMING] Failed to warm cache:', error);
      // Don't throw - cache warming failures should not break startup
    }
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    await this.subscriber.quit();
    await this.publisher.quit();
    console.log('👋 Redis tracker cache disconnected');
  }
}

// Singleton instance
export const redisTrackerCache = new RedisTrackerCache();
