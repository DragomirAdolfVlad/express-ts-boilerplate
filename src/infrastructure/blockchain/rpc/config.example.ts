/**
 * Example Configuration for Optimized RPC Layer
 * 
 * This demonstrates how to configure the RPC layer for production use
 */

import { OptimizedRpcConfig } from './OptimizedRpcLayer';

export const productionRpcConfig: OptimizedRpcConfig = {
  // Multiple RPC endpoints for load balancing and failover
  endpoints: [
    {
      url: process.env['MONAD_HTTP_URL'] || 'https://rpc1.monad.network',
      type: 'http',
      priority: 10,
      weight: 3
    },
    {
      url: process.env['MONAD_HTTP_URL_2'] || 'https://rpc2.monad.network',
      type: 'http',
      priority: 10,
      weight: 3
    },
    {
      url: process.env['MONAD_HTTP_URL_3'] || 'https://rpc3.monad.network',
      type: 'http',
      priority: 5,
      weight: 2
    },
    {
      url: process.env['MONAD_WS_URL'] || 'wss://ws.monad.network',
      type: 'ws',
      priority: 15,
      weight: 5
    }
  ],
  
  chainId: 10143,
  networkName: 'monad-testnet',
  
  // Redis caching with 1-5 second TTL
  cache: {
    enabled: true,
    ttl: 3, // 3 seconds for hot data
    redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379'
  },
  
  // Batch RPC requests with 100+ events per batch
  batching: {
    enabled: true,
    maxBatchSize: 150,
    maxWaitTime: 50 // ms
  },
  
  // Health checks every 30 seconds
  healthCheck: {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    failureThreshold: 3,
    successThreshold: 2
  },
  
  // Bloom filter to skip blocks with no relevant events
  bloomFilter: {
    enabled: true,
    expectedElements: 100000, // Expected number of blocks to track
    falsePositiveRate: 0.01 // 1% false positive rate
  },
  
  // Retry with exponential backoff
  retry: {
    maxAttempts: 3,
    baseDelay: 500, // ms
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2
  }
};

export const developmentRpcConfig: OptimizedRpcConfig = {
  endpoints: [
    {
      url: process.env['MONAD_HTTP_URL'] || 'http://localhost:8545',
      type: 'http',
      priority: 10,
      weight: 1
    }
  ],
  
  chainId: 10143,
  networkName: 'monad-testnet',
  
  cache: {
    enabled: true,
    ttl: 5,
    redisUrl: process.env['REDIS_URL']
  },
  
  batching: {
    enabled: true,
    maxBatchSize: 100,
    maxWaitTime: 100
  },
  
  healthCheck: {
    interval: 60000,
    timeout: 10000,
    failureThreshold: 5,
    successThreshold: 2
  },
  
  bloomFilter: {
    enabled: false, // Disable in development
    expectedElements: 10000,
    falsePositiveRate: 0.01
  },
  
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  }
};
