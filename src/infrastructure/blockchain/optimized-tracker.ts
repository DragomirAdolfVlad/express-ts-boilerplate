/**
 * Optimized Token Creation Tracker
 * 
 * Production-ready version with:
 * - RPC request batching and deduplication
 * - Rate limiting protection
 * - Memory management
 * - Error recovery
 * - Performance monitoring
 */

import { JsonRpcProvider, WebSocketProvider, ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { BLOCKCHAIN_CONFIG } from '../../config/blockchain.config';
import { TrackerRedisIntegration } from './tracker-redis-integration';

interface BatchRequest {
  method: string;
  params: any[];
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class OptimizedRPCManager {
  private requestQueue: BatchRequest[] = [];
  private batchTimer?: NodeJS.Timeout;
  private cache = new Map<string, CacheEntry<any>>();
  private requestCount = 0;
  private lastResetTime = Date.now();
  private cacheCleanupTimer?: NodeJS.Timeout;
  
  constructor(private provider: JsonRpcProvider) {
    // Start periodic cache cleanup
    this.startCacheCleanup();
  }

  async request(method: string, params: any[]): Promise<any> {
    // Check cache first
    const cacheKey = `${method}:${JSON.stringify(params)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Rate limiting check
    await this.enforceRateLimit();

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ method, params, resolve, reject });
      this.scheduleBatch();
    });
  }

  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private setCache(key: string, data: any, ttl: number = BLOCKCHAIN_CONFIG.CACHE_DEFAULT_TTL_MS) {
    // Prevent cache from growing too large
    if (this.cache.size >= BLOCKCHAIN_CONFIG.CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;
    
    if (timeSinceReset >= 1000) {
      // Reset counter every second
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    if (this.requestCount >= BLOCKCHAIN_CONFIG.RPC_MAX_REQUESTS_PER_SECOND) {
      const waitTime = 1000 - timeSinceReset;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }
  }

  private scheduleBatch() {
    if (this.batchTimer) return;
    
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, BLOCKCHAIN_CONFIG.RPC_BATCH_TIMEOUT_MS);
  }

  private async processBatch() {
    if (this.requestQueue.length === 0) return;
    
    const batch = this.requestQueue.splice(0, BLOCKCHAIN_CONFIG.RPC_BATCH_SIZE);
    this.batchTimer = undefined;
    
    // Group similar requests
    const groupedRequests = new Map<string, BatchRequest[]>();
    
    for (const request of batch) {
      const key = request.method;
      if (!groupedRequests.has(key)) {
        groupedRequests.set(key, []);
      }
      groupedRequests.get(key)!.push(request);
    }
    
    // Execute grouped requests
    for (const [method, requests] of groupedRequests) {
      await this.executeGroupedRequests(method, requests);
    }
    
    // Schedule next batch if queue not empty
    if (this.requestQueue.length > 0) {
      this.scheduleBatch();
    }
  }

  private async executeGroupedRequests(method: string, requests: BatchRequest[]) {
    try {
      if (method === 'eth_getLogs' && requests.length > 1) {
        // Combine multiple getLogs requests
        await this.executeCombinedGetLogs(requests);
      } else {
        // Execute individual requests
        for (const request of requests) {
          try {
            this.requestCount++;
            const result = await this.provider.send(request.method, request.params);
            
            // Cache the result
            const cacheKey = `${request.method}:${JSON.stringify(request.params)}`;
            this.setCache(cacheKey, result);
            
            request.resolve(result);
          } catch (error) {
            request.reject(error);
          }
        }
      }
    } catch (error) {
      // Reject all requests in the group
      requests.forEach(request => request.reject(error));
    }
  }

  private async executeCombinedGetLogs(requests: BatchRequest[]) {
    // Combine multiple address filters into single request
    const addresses: string[] = [];
    const topics: string[][] = [];
    let fromBlock = Infinity;
    let toBlock = -Infinity;
    
    for (const request of requests) {
      const params = request.params[0];
      if (params.address) {
        if (Array.isArray(params.address)) {
          addresses.push(...params.address);
        } else {
          addresses.push(params.address);
        }
      }
      if (params.topics) {
        topics.push(...params.topics);
      }
      if (params.fromBlock) {
        fromBlock = Math.min(fromBlock, parseInt(params.fromBlock, 16));
      }
      if (params.toBlock) {
        toBlock = Math.max(toBlock, parseInt(params.toBlock, 16));
      }
    }
    
    // Retry logic with exponential backoff for RPC errors
    let retries = 3;
    let delay = 1000; // Start with 1 second

    while (retries > 0) {
      try {
        this.requestCount++;
        const combinedResult = await this.provider.send('eth_getLogs', [{
          address: [...new Set(addresses)], // Remove duplicates
          topics: topics.length > 0 ? [topics.flat()] : undefined,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`
        }]);
        
        // Distribute results back to individual requests
        for (const request of requests) {
          const params = request.params[0];
          const filteredLogs = combinedResult.filter((log: any) => {
            if (params.address) {
              const requestAddresses = Array.isArray(params.address) ? params.address : [params.address];
              if (!requestAddresses.some((addr: string) => addr.toLowerCase() === log.address.toLowerCase())) {
                return false;
              }
            }
            return true;
          });
          
          request.resolve(filteredLogs);
        }
        return; // Success, exit retry loop
        
      } catch (error: any) {
        retries--;
        
        // Check if it's a temporary RPC error (archiver issues)
        if (error.code === 'UNKNOWN_ERROR' && error.error?.message?.includes('archiver')) {
          if (retries > 0) {
            console.log(`🔄 RPC RETRY: Archiver error, retrying in ${delay}ms (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            continue;
          }
        }
        
        // If all retries failed or it's a different error, fall back to individual requests
        console.log(`⚠️ RPC FALLBACK: Combined request failed, trying individual requests`);
        
        for (const request of requests) {
          try {
            this.requestCount++;
            const result = await this.provider.send(request.method, request.params);
            request.resolve(result);
          } catch (individualError: any) {
            // If individual request also fails, resolve with empty array to continue processing
            console.log(`⚠️ RPC SKIP: Individual request failed, continuing with empty result`);
            request.resolve([]);
          }
        }
        return;
      }
    }
  }

  /**
   * Start periodic cache cleanup to prevent memory leaks
   */
  private startCacheCleanup() {
    this.cacheCleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`[🧹 CACHE] Cleaned ${cleaned} expired entries, ${this.cache.size} remaining`);
      }
    }, BLOCKCHAIN_CONFIG.CACHE_CLEANUP_INTERVAL_MS);
  }

  clearCache() {
    this.cache.clear();
  }

  destroy() {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.cache.clear();
    this.requestQueue = [];
  }

  getStats() {
    return {
      queueSize: this.requestQueue.length,
      cacheSize: this.cache.size,
      requestsPerSecond: this.requestCount
    };
  }
}

export class OptimizedTokenCreationTracker {
  private isRunning = false;
  private rpcManager: OptimizedRPCManager;
  private processedEvents = new Set<string>();
  private bondingCurveCache: string[] = [];
  private lastCacheUpdate = 0;
  private currentBlockTimestamp: Date = new Date();
  private readonly CACHE_TTL = 60000; // 1 minute
  private redisIntegration: TrackerRedisIntegration;
  private redisEnabled = false;
  private memoryCleanupTimer?: NodeJS.Timeout;
  private readonly MAX_PROCESSED_EVENTS = 5000; // Limit to prevent memory leak

  constructor(
    private provider: JsonRpcProvider | WebSocketProvider,
    private prisma: PrismaClient,
    httpProvider?: JsonRpcProvider
  ) {
    const rpcProvider = httpProvider || (provider instanceof JsonRpcProvider ? provider : new JsonRpcProvider(process.env['MONAD_RPC_URL']));
    this.rpcManager = new OptimizedRPCManager(rpcProvider);
    this.redisIntegration = new TrackerRedisIntegration(prisma);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🚀 Starting OPTIMIZED Token Creation Tracker...');
    console.log('   ⚡ RPC request batching enabled');
    console.log('   🛡️  Rate limiting protection active');
    console.log('   💾 Memory management optimized');
    // Redis integration (disabled by default due to memory optimization)
    const ENABLE_REDIS = process.env['ENABLE_REDIS_CACHE'] === 'true';
    this.redisEnabled = ENABLE_REDIS;
    
    if (ENABLE_REDIS) {
      console.log('   🔥 Redis live-data integration enabled');
      try {
        await this.redisIntegration.initialize();
        console.log('   ✅ Redis pub/sub and pipelines ready');
      } catch (error) {
        console.warn('   ⚠️  Redis initialization failed (continuing without cache):', error);
        this.redisEnabled = false;
      }
    } else {
      console.log('   ℹ️  Redis cache disabled (set ENABLE_REDIS_CACHE=true to enable)');
    }
    
    this.isRunning = true;

    // Start memory monitoring and cleanup
    this.startMemoryMonitoring();

    if (this.provider instanceof WebSocketProvider) {
      this.provider.on('block', async (blockNumber) => {
        setTimeout(async () => {
          await this.processBlockOptimized(blockNumber);
        }, 500);
      });
    } else {
      setInterval(async () => {
        const latestBlock = await this.rpcManager.request('eth_blockNumber', []);
        const blockNumber = parseInt(latestBlock, 16);
        await this.processBlockOptimized(Math.max(0, blockNumber - 1));
      }, 2000);
    }

    console.log('✅ Optimized Token Creation Tracker started');
  }

  private async processBlockOptimized(blockNumber: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get real block timestamp with ONE RPC call per block
      let blockTimestamp: Date;
      try {
        const blockData = await this.rpcManager.request('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false]);
        blockTimestamp = new Date(parseInt(blockData.timestamp, 16) * 1000);
      } catch (error) {
        // Fallback to current time if RPC fails
        blockTimestamp = new Date();
        console.log(`⚠️ Block timestamp fetch failed for block ${blockNumber}, using current time`);
      }
      
      // Store block timestamp for this processing cycle
      this.currentBlockTimestamp = blockTimestamp;
      
      // Get bonding curve addresses (cached)
      const bondingCurves = await this.getBondingCurveAddressesCached();
      
      // Always monitor the factory contract, even if no bonding curves exist yet
      const factoryAddress = process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
      
      if (bondingCurves.length === 0) {
        if (blockNumber % 50 === 0) {
          console.log(`⚠️  No bonding curves cached yet, monitoring factory only: ${factoryAddress}`);
        }
        // Still monitor the factory for new token creations
      }

      // Single request for all addresses and all event types
      const allAddresses = [factoryAddress, ...bondingCurves];
      const allTopics = await this.getAllEventTopics();
      
      // Single batched request instead of 300+ individual requests
      const allLogs = await this.rpcManager.request('eth_getLogs', [{
        fromBlock: `0x${blockNumber.toString(16)}`,
        toBlock: `0x${blockNumber.toString(16)}`,
        address: allAddresses,
        topics: [allTopics]
      }]); // Cached automatically

      if (allLogs.length > 0) {
        console.log(`📊 OPTIMIZED: Block ${blockNumber} - Found ${allLogs.length} events from ${allAddresses.length} contracts`);
        
        // Process events in parallel with deduplication
        await this.processEventsInParallel(allLogs);
      } else if (blockNumber % 100 === 0) {
        // Log every 100 blocks when no events found
        console.log(`📊 OPTIMIZED: Block ${blockNumber} - No events found (monitoring ${allAddresses.length} contracts)`);
      }

      const processingTime = Date.now() - startTime;
      const eventCount = allLogs ? allLogs.length : 0;
      
      // Log performance stats periodically
      if (blockNumber % 10 === 0) {
        console.log(`⚡ PERFORMANCE: Block ${blockNumber} processed in ${processingTime}ms (${eventCount} events)`);
        console.log(`   RPC Stats: ${JSON.stringify(this.rpcManager.getStats())}`);
      }

    } catch (error) {
      console.error(`❌ OPTIMIZED: Error processing block ${blockNumber}:`, error);
    }
  }

  private async getAllEventTopics(): Promise<string[]> {
    const { getEventTopicHash, BONDING_CURVE_EVENTS } = await import('./abis/official-nad-fun.abi');
    
    return [
      await getEventTopicHash(BONDING_CURVE_EVENTS.CurveCreate),
      await getEventTopicHash(BONDING_CURVE_EVENTS.CurveBuy),
      await getEventTopicHash(BONDING_CURVE_EVENTS.CurveSell),
      // Alternative signatures
      ethers.id('Buy(address,address,uint256,uint256)'),
      ethers.id('Sell(address,address,uint256,uint256)'),
      ethers.id('TokenBuy(address,address,uint256,uint256)'),
      ethers.id('TokenSell(address,address,uint256,uint256)'),
    ];
  }

  private async processEventsInParallel(logs: any[]): Promise<void> {
    if (!logs || logs.length === 0) return;

    // Deduplicate events
    const uniqueLogs = logs.filter(log => {
      const eventId = `${log.transactionHash}:${log.logIndex}`;
      if (this.processedEvents.has(eventId)) return false;
      this.processedEvents.add(eventId);
      return true;
    });

    if (uniqueLogs.length === 0) return;

    // CRITICAL: Prevent memory leak - keep only recent events
    if (this.processedEvents.size > this.MAX_PROCESSED_EVENTS) {
      const eventsArray = Array.from(this.processedEvents);
      this.processedEvents.clear();
      // Keep only the most recent half to reduce frequency of cleanup
      const keepCount = Math.floor(this.MAX_PROCESSED_EVENTS / 2);
      eventsArray.slice(-keepCount).forEach(id => this.processedEvents.add(id));
      console.log(`[🧹 MEMORY] Cleaned processedEvents: ${eventsArray.length} → ${this.processedEvents.size}`);
    }

    const startTime = Date.now();

    // Process events with smart concurrency based on config
    if (BLOCKCHAIN_CONFIG.PARALLEL_EVENT_PROCESSING) {
      // Parallel processing with concurrency limit
      await this.processEventsWithConcurrency(uniqueLogs, BLOCKCHAIN_CONFIG.MAX_CONCURRENT_EVENTS);
    } else {
      // Sequential processing (safer but slower)
      for (const log of uniqueLogs) {
        await this.processEventSafely(log);
      }
    }

    const duration = Date.now() - startTime;
    if (uniqueLogs.length > 5) {
      console.log(`⚡ PARALLEL: Processed ${uniqueLogs.length} events in ${duration}ms (${Math.round(uniqueLogs.length / (duration / 1000))} events/sec)`);
    }
  }

  /**
   * Process events with controlled concurrency to prevent overload
   */
  private async processEventsWithConcurrency(logs: any[], concurrencyLimit: number): Promise<void> {
    const results: Promise<void>[] = [];
    let activeCount = 0;

    for (const log of logs) {
      // Wait if we've hit the concurrency limit
      while (activeCount >= concurrencyLimit) {
        await Promise.race(results);
        activeCount = results.filter(p => p && typeof p === 'object').length;
      }

      // Process event
      const promise = this.processEventSafely(log)
        .finally(() => {
          activeCount--;
        });

      results.push(promise);
      activeCount++;
    }

    // Wait for all remaining events
    await Promise.allSettled(results);
  }

  private async processEventSafely(log: any): Promise<void> {
    try {
      // Determine event type and process accordingly
      const { getEventTopicHash, BONDING_CURVE_EVENTS } = await import('./abis/official-nad-fun.abi');
      const curveCreateTopic = await getEventTopicHash(BONDING_CURVE_EVENTS.CurveCreate);
      
      if (log.topics[0] === curveCreateTopic) {
        await this.processCurveCreateEvent(log);
      } else {
        await this.processTradeEvent(log);
      }
    } catch (error) {
      console.error(`❌ Event processing error:`, error);
      // Don't let individual event errors stop the whole process
    }
  }

  private async getBondingCurveAddressesCached(): Promise<string[]> {
    const now = Date.now();
    
    if (this.bondingCurveCache.length > 0 && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.bondingCurveCache;
    }
    
    try {
      const tokens = await this.prisma.monadLaunchedToken.findMany({
        where: { bondingCurve: { not: 'unknown' } },
        select: { bondingCurve: true },
        distinct: ['bondingCurve']
      });
      
      this.bondingCurveCache = tokens.map(t => t.bondingCurve).filter(addr => addr && addr !== 'unknown');
      this.lastCacheUpdate = now;
      
      return this.bondingCurveCache;
    } catch (error) {
      console.warn('Failed to get bonding curve addresses:', error);
      return this.bondingCurveCache;
    }
  }

  private async processCurveCreateEvent(log: any): Promise<void> {
    try {
      const { ethers } = await import('ethers');
      const { BONDING_CURVE_ABI } = await import('./abis/official-nad-fun.abi');
      
      const iface = new ethers.Interface(BONDING_CURVE_ABI);
      const decoded = iface.parseLog({ topics: log.topics, data: log.data });

      if (!decoded || decoded.name !== 'CurveCreate') {
        console.warn('❌ CURVE CREATE: Failed to decode or wrong event type');
        return;
      }

      const {
        creator,
        token: tokenAddress,
        pool: bondingCurve,
        name,
        symbol
      } = decoded.args;

      console.log(`🎉 OPTIMIZED CURVE CREATE: ${name} (${symbol}) by ${creator}`);

      // Fetch extended metadata from NAD.FUN API
      let metadata = null;
      try {
        const { nadFunApi } = await import('../external/nadfun-api.service');
        console.log(`🔍 METADATA: Fetching for ${tokenAddress}...`);
        metadata = await nadFunApi.getTokenMetadata(tokenAddress);
        if (metadata) {
          console.log(`✅ METADATA: Retrieved for ${metadata.name} (${metadata.symbol})`);
        } else {
          console.warn(`⚠️  METADATA: Not found for ${tokenAddress}`);
        }
      } catch (metadataError) {
        console.warn(`⚠️  METADATA: Failed to fetch for ${tokenAddress}:`, metadataError);
      }

      // Create metadata record if we have extended data
      let metadataId: number | undefined = undefined;
      if (metadata && (metadata.description || metadata.image_uri || metadata.website || metadata.twitter || metadata.telegram)) {
        try {
          const metadataRecord = await this.prisma.monadTokenMetadata.create({
            data: {
              name: metadata.name || name,
              symbol: metadata.symbol || symbol,
              description: metadata.description || undefined,
              image: metadata.image_uri || undefined,
              website: metadata.website ? { url: metadata.website } : undefined,
              twitter: metadata.twitter || undefined,
              telegram: metadata.telegram || undefined
            }
          });
          metadataId = metadataRecord.id;
          console.log(`📝 METADATA: Created record ${metadataId} for ${tokenAddress}`);
        } catch (metadataCreateError) {
          console.error(`❌ METADATA: Failed to create record:`, metadataCreateError);
        }
      }

      // Save token to database with metadata link
      const savedToken = await this.prisma.monadLaunchedToken.upsert({
        where: { token: tokenAddress },
        create: {
          platform: 'monad',
          signature: log.transactionHash,
          creator,
          token: tokenAddress,
          bondingCurve,
          blockNumber: log.blockNumber.toString(),
          blockId: log.blockHash || 'unknown',
          commitState: 'verified',
          timestamp: new Date(),
          name: metadata?.name || name,
          symbol: metadata?.symbol || symbol,
          metadataId
        },
        update: {
          bondingCurve,
          name: metadata?.name || name || undefined,
          symbol: metadata?.symbol || symbol || undefined,
          metadataId: metadataId || undefined
        }
      });

      // 🔥 CACHE IN REDIS + PUBLISH EVENT (Real-time updates!)
      if (this.redisEnabled) {
        try {
          await this.redisIntegration.cacheTokenFromEvent({
            tokenAddress: savedToken.token,
            name: savedToken.name || 'Unknown',
            symbol: savedToken.symbol || '???',
            creator: savedToken.creator,
            bondingCurve: savedToken.bondingCurve,
            blockNumber: savedToken.blockNumber,
            blockHash: savedToken.blockId,
            timestamp: savedToken.timestamp,
            transactionHash: savedToken.signature,
            metadataId: savedToken.metadataId || undefined
          });
          console.log(`🔥 REDIS: Cached token ${savedToken.name} + published TOKEN_CREATED event`);
        } catch (redisError) {
          console.warn('⚠️  Redis cache failed (non-fatal):', redisError);
        }
      }

      // Invalidate bonding curve cache
      this.lastCacheUpdate = 0;

    } catch (error) {
      console.error('❌ OPTIMIZED CURVE CREATE: Failed to process:', error);
    }
  }

  private async processTradeEvent(log: any): Promise<void> {
    try {
      let decoded: any = null;
      
      // Try main ABI first
      try {
        const { BONDING_CURVE_ABI } = await import('./abis/official-nad-fun.abi');
        const iface = new ethers.Interface(BONDING_CURVE_ABI);
        decoded = iface.parseLog({ topics: log.topics, data: log.data });
      } catch (mainAbiError) {
        // Try alternative signatures
        const alternativeSignatures = [
          'Buy(address,address,uint256,uint256)',
          'Sell(address,address,uint256,uint256)',
          'TokenBuy(address,address,uint256,uint256)',
          'TokenSell(address,address,uint256,uint256)',
        ];
        
        for (const signature of alternativeSignatures) {
          try {
            const tempInterface = new ethers.Interface([`event ${signature}`]);
            decoded = tempInterface.parseLog({ topics: log.topics, data: log.data });
            break;
          } catch (altError) {
            // Continue to next signature
          }
        }
      }
      
      if (!decoded) {
        console.warn(`❌ OPTIMIZED TRADE: Could not decode log`);
        return;
      }

      const buyEventNames = ['CurveBuy', 'Buy', 'TokenBuy', 'BondingCurveBuy'];
      const sellEventNames = ['CurveSell', 'Sell', 'TokenSell', 'BondingCurveSell'];
      
      const isBuyEvent = buyEventNames.includes(decoded.name);
      const isSellEvent = sellEventNames.includes(decoded.name);
      
      if (!isBuyEvent && !isSellEvent) {
        return;
      }

      const {
        sender: trader,
        token: tokenAddress,
        amountIn,
        amountOut
      } = decoded.args;

      console.log(`✅ OPTIMIZED TRADE: ${decoded.name} - ${tokenAddress.slice(0, 10)}...`);

      // Process with enhanced trade processor
      const { EnhancedTradeProcessor } = await import('./enhanced-trade-processor');
      const tradeProcessor = new EnhancedTradeProcessor(
        this.provider instanceof JsonRpcProvider ? this.provider : new JsonRpcProvider(process.env['MONAD_RPC_URL']),
        this.prisma
      );

      const isBuy = isBuyEvent;
      const wmonAmount = isBuy ? amountIn : amountOut;
      const tokenAmount = isBuy ? amountOut : amountIn;
      const pricePerToken = tokenAmount > 0n ? (wmonAmount * BigInt(1e18)) / tokenAmount : 0n;

      const reserves = {
        reserve1: BigInt(0),
        reserve2: BigInt(0), 
        reserve3: BigInt(30000) * BigInt(1e18),
        reserve4: BigInt(1000000000) * BigInt(1e18)
      };

      // Pass actual block information to avoid RPC calls in enhanced processor
      await tradeProcessor.processTradeWithEnhancedData(
        log.transactionHash,
        parseInt(log.logIndex, 16), // Convert hex string to integer
        tokenAddress,
        trader,
        isBuy,
        wmonAmount,
        tokenAmount,
        pricePerToken,
        reserves,
        'finalized',
        log.blockNumber, // Real block number from log
        log.blockHash,   // Real block hash from log
        this.currentBlockTimestamp // Real timestamp from block
      );

      // 🔥 CACHE TRADE IN REDIS + PUBLISH EVENT (Real-time updates!)
      if (this.redisEnabled) {
        try {
          const uniqueTradeId = `${log.transactionHash}:${parseInt(log.logIndex, 16)}`;
          await this.redisIntegration.cacheTradeFromEvent({
            uniqueTradeId,
            tokenAddress,
            trader,
            isBuy,
            ethAmount: wmonAmount.toString(),
            tokenAmount: tokenAmount.toString(),
            pricePerToken: pricePerToken.toString(),
            blockNumber: log.blockNumber.toString(),
            timestamp: this.currentBlockTimestamp
          });
          console.log(`🔥 REDIS: Cached trade ${isBuy ? 'BUY' : 'SELL'} + published TRADE_EXECUTED event`);
        } catch (redisError) {
          console.warn('⚠️  Redis trade cache failed (non-fatal):', redisError);
        }
      }

    } catch (error) {
      console.error('❌ OPTIMIZED TRADE: Failed to process:', error);
    }
  }
  
  /**
   * Start memory monitoring to prevent leaks
   */
  private startMemoryMonitoring(): void {
    this.memoryCleanupTimer = setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const externalMB = Math.round(memUsage.external / 1024 / 1024);
      
      console.log(`[💾 MEMORY] Heap: ${heapUsedMB}/${heapTotalMB} MB | External: ${externalMB} MB | Events: ${this.processedEvents.size}`);
      
      // Trigger aggressive cleanup if memory usage is high (>80% of 4GB default)
      if (heapUsedMB > 3200) {
        console.warn(`[⚠️  MEMORY] High memory usage detected! Triggering cleanup...`);
        this.performAggressiveCleanup();
      }
    }, 60000); // Every minute
  }

  /**
   * Perform aggressive cleanup when memory is high
   */
  private performAggressiveCleanup(): void {
    console.log('[🧹 MEMORY] Starting aggressive cleanup...');
    
    // Clear processed events (keep only last 1000)
    if (this.processedEvents.size > 1000) {
      const eventsArray = Array.from(this.processedEvents);
      this.processedEvents.clear();
      eventsArray.slice(-1000).forEach(id => this.processedEvents.add(id));
      console.log(`[🧹 MEMORY] Cleared processedEvents: ${eventsArray.length} → ${this.processedEvents.size}`);
    }
    
    // Clear RPC cache
    this.rpcManager.clearCache();
    console.log('[🧹 MEMORY] Cleared RPC cache');
    
    // Clear bonding curve cache
    this.bondingCurveCache = [];
    this.lastCacheUpdate = 0;
    console.log('[🧹 MEMORY] Cleared bonding curve cache');
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[🧹 MEMORY] Forced garbage collection');
    } else {
      console.log('[⚠️  MEMORY] Garbage collection not available (run with --expose-gc)');
    }
    
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    console.log(`[✅ MEMORY] Cleanup complete. Current heap: ${heapUsedMB} MB`);
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Stop memory monitoring
    if (this.memoryCleanupTimer) {
      clearInterval(this.memoryCleanupTimer);
    }
    
    // Cleanup resources
    this.rpcManager.clearCache();
    this.rpcManager.destroy();
    this.processedEvents.clear();
    this.bondingCurveCache = [];
    
    if (this.provider instanceof WebSocketProvider) {
      await this.provider.destroy();
    }
    
    console.log('🛑 Optimized Token Creation Tracker stopped');
  }

  /**
   * Detect new token from first trade (called by trade processor)
   */
  async detectTokenFromFirstTrade(
    tokenAddress: string,
    tradeSignature: string,
    _logIndex: number,
    trader: string,
    blockNumber: string,
    blockHash: string,
    timestamp: Date
  ): Promise<void> {
    try {
      // Create token creation event with unique signature per token
      const uniqueSignature = `${tradeSignature}:${tokenAddress}`;
      
      await this.prisma.monadLaunchedToken.upsert({
        where: { token: tokenAddress },
        create: {
          platform: 'monad',
          signature: uniqueSignature, // Make signature unique per token
          creator: trader, // Use first trader as creator fallback
          token: tokenAddress,
          bondingCurve: process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
          blockNumber,
          blockId: blockHash,
          commitState: 'verified',
          timestamp,
          name: 'Unknown',
          symbol: 'UNK'
        },
        update: {
          // Update with latest trade info if token already exists
          blockNumber,
          blockId: blockHash,
          timestamp
        }
      });

      console.log(`🆕 OPTIMIZED: Token processed - ${tokenAddress}`);

      // Invalidate bonding curve cache
      this.lastCacheUpdate = 0;

    } catch (error: any) {
      // Handle unique constraint errors gracefully (race condition)
      if (error.code === 'P2002' && error.meta?.target?.includes('token')) {
        console.log(`🔄 OPTIMIZED: Token ${tokenAddress} already exists (race condition handled)`);
        return;
      }
      console.error(`❌ OPTIMIZED: Failed to detect token ${tokenAddress}:`, error);
    }
  }

  /**
   * Backfill missing token creation data
   */
  async backfillTokenCreations(): Promise<void> {
    console.log('🔄 OPTIMIZED: Starting token creation backfill...');

    try {
      // Find tokens that might be missing creation data
      const tokensWithTrades = await this.prisma.monadTokenTrade.findMany({
        select: { 
          tokenAddress: true,
          signature: true,
          logIndex: true,
          trader: true,
          blockNumber: true,
          timestamp: true
        },
        distinct: ['tokenAddress'],
        orderBy: { timestamp: 'asc' },
        take: 100 // Limit to prevent overwhelming
      });

      console.log(`🔄 OPTIMIZED: Found ${tokensWithTrades.length} tokens to check`);

      for (const trade of tokensWithTrades) {
        await this.detectTokenFromFirstTrade(
          trade.tokenAddress,
          trade.signature || '',
          trade.logIndex || 0,
          trade.trader,
          trade.blockNumber,
          'unknown',
          trade.timestamp
        );

        // Small delay to avoid overwhelming RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('✅ OPTIMIZED: Token creation backfill completed');

    } catch (error) {
      console.error('❌ OPTIMIZED: Failed to backfill token creations:', error);
    }
  }

  getOptimizationStats() {
    return {
      isRunning: this.isRunning,
      processedEventsCount: this.processedEvents.size,
      bondingCurveCacheSize: this.bondingCurveCache.length,
      rpcStats: this.rpcManager.getStats()
    };
  }
}