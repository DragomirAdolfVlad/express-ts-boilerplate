/**
 * Blockchain Configuration Constants
 * 
 * Centralized configuration for all blockchain-related operations
 * to improve maintainability and performance tuning
 */

export const BLOCKCHAIN_CONFIG = {
  // Monad Network
  CHAIN_ID: 10143,
  NETWORK_NAME: 'monad-testnet',

  // NAD.FUN Contract Addresses
  BONDING_CURVE_ADDRESS: process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
  FACTORY_ADDRESS: process.env['NADFUN_FACTORY_ADDRESS'],

  // Token Decimals (NAD.FUN standard)
  TOKEN_DECIMALS: 18,
  WMON_DECIMALS: 18,

  // Virtual Reserves (NAD.FUN constants)
  VIRTUAL_WMON_RESERVE: 30000, // 30K WMON
  VIRTUAL_TOKEN_RESERVE: 1000000000, // 1B tokens

  // Block Processing
  BLOCK_PROCESSING_DELAY_MS: 500, // Wait for block to be available
  FINALIZATION_DELAY_MS: 1000, // Monad finalization time
  BLOCK_CONFIRMATION_BLOCKS: 1, // Safe block lag

  // RPC Configuration
  RPC_BATCH_SIZE: 10, // Optimal batch size for requests
  RPC_BATCH_TIMEOUT_MS: 100, // Batch collection timeout
  RPC_MAX_REQUESTS_PER_SECOND: 400, // QuickNode rate limit
  RPC_RETRY_ATTEMPTS: 3, // Max retry attempts
  RPC_RETRY_BASE_DELAY_MS: 1000, // Initial retry delay
  RPC_RETRY_MAX_DELAY_MS: 30000, // Max retry delay
  RPC_RETRY_BACKOFF_FACTOR: 2, // Exponential backoff multiplier

  // Caching
  CACHE_DEFAULT_TTL_MS: 30000, // 30 seconds default TTL
  CACHE_MAX_SIZE: 1000, // Max cache entries
  CACHE_CLEANUP_INTERVAL_MS: 60000, // Cache cleanup every minute
  BLOCK_CACHE_SIZE: 1000,
  RESERVE_CACHE_SIZE: 500,
  BONDING_CURVE_CACHE_TTL_MS: 60000, // 1 minute for bonding curve list

  // API Configuration
  NADFUN_API_URL: process.env['NADFUN_API_URL'] || 'https://testnet-v3-api.nad.fun',
  NADFUN_API_TIMEOUT_MS: 5000,
  NADFUN_API_BATCH_SIZE: 5,
  NADFUN_API_BATCH_DELAY_MS: 1000,

  // Event Processing
  MAX_EVENTS_PER_BLOCK: 1000, // Safety limit
  PARALLEL_EVENT_PROCESSING: true, // Process events in parallel
  MAX_CONCURRENT_EVENTS: 10, // Concurrent event processing limit

  // Database
  DB_BATCH_SIZE: 50, // Batch database operations
  DB_OPERATION_TIMEOUT_MS: 10000,
  DB_RETRY_ATTEMPTS: 3,
  DB_RETRY_DELAY_MS: 1000,

  // Health Monitoring
  HEALTH_CHECK_INTERVAL_MS: 30000, // 30 seconds
  STATS_LOG_INTERVAL_MS: 300000, // 5 minutes
  CLEANUP_INTERVAL_MS: 300000, // 5 minutes

  // Price Calculation
  WMON_PRICE_USD: 3.25, // Mock WMON price (would get from oracle)
  MAX_PRICE_CHANGE_PERCENT: 50, // Suspicious price threshold

  // Data Quality
  ARCHIVE_INACTIVE_TOKENS_DAYS: 30,
  DELETE_ARCHIVED_DATA_DAYS: 90,
} as const;

/**
 * Derived configurations (computed from base config)
 */
export const DERIVED_CONFIG = {
  // Total supply with decimals
  TOTAL_SUPPLY_WEI: BigInt(10 ** 27), // 1e27 wei (1B tokens * 1e18)
  
  // Virtual reserves in wei
  VIRTUAL_WMON_RESERVE_WEI: BigInt(BLOCKCHAIN_CONFIG.VIRTUAL_WMON_RESERVE) * BigInt(10 ** BLOCKCHAIN_CONFIG.WMON_DECIMALS),
  VIRTUAL_TOKEN_RESERVE_WEI: BigInt(BLOCKCHAIN_CONFIG.VIRTUAL_TOKEN_RESERVE) * BigInt(10 ** BLOCKCHAIN_CONFIG.TOKEN_DECIMALS),
} as const;

/**
 * Environment-based configuration overrides
 */
export function getBlockchainConfig() {
  return {
    ...BLOCKCHAIN_CONFIG,
    // Allow runtime overrides from environment
    RPC_MAX_REQUESTS_PER_SECOND: parseInt(process.env['RPC_MAX_REQUESTS_PER_SECOND'] || String(BLOCKCHAIN_CONFIG.RPC_MAX_REQUESTS_PER_SECOND)),
    CACHE_MAX_SIZE: parseInt(process.env['CACHE_MAX_SIZE'] || String(BLOCKCHAIN_CONFIG.CACHE_MAX_SIZE)),
    PARALLEL_EVENT_PROCESSING: process.env['PARALLEL_EVENT_PROCESSING'] !== 'false',
  };
}
