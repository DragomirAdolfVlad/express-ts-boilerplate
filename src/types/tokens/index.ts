/**
 * Token API Type Definitions
 * 
 * This module contains all TypeScript interfaces and types for the Monad Token API endpoints.
 * These types align with the requirements and design documents for the token tracking system.
 */

// =============================================================================
// TOKEN DATA MODELS
// =============================================================================

/**
 * Token metadata information
 */
export interface TokenMetadata {
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

/**
 * Token statistics aggregated from trades
 */
export interface TokenStats {
  totalVolume: number;        // Total volume in USD
  totalTrades: number;        // Total number of trades
  buyCount: number;           // Number of buy trades
  sellCount: number;          // Number of sell trades
  marketCap: number;          // Market capitalization in USD
  liquidityUsd: number;       // Liquidity in USD
  curveProgress: number;      // Bonding curve progress (0-100%)
  lastTradeTime: Date;        // Timestamp of last trade
  
  // Commit state distribution
  proposedTrades: number;     // Number of proposed trades
  finalizedTrades: number;    // Number of finalized trades
  verifiedTrades: number;     // Number of verified trades
}

/**
 * Token with complete statistics
 * Used for listing endpoints (latest, pre-bond)
 */
export interface TokenWithStats {
  // Token basic info
  address: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurve: string;
  timestamp: Date;
  
  // Metadata
  metadata?: TokenMetadata;
  
  // Statistics
  stats: TokenStats;
}

/**
 * Token with extended metadata
 * Used for detailed token views
 */
export interface TokenWithMetadata extends TokenWithStats {
  // Additional fields can be added here if needed
}

// =============================================================================
// HOLDER DATA MODELS
// =============================================================================

/**
 * Holder ranking information
 * Represents a token holder with their trading activity and PnL
 */
export interface HolderData {
  address: string;
  rank: number;                 // 1-based ranking by netTokens
  
  // Holdings
  netTokens: number;            // Current balance (totalBought - totalSold)
  percentageOfSupply: number;   // Percentage of total supply held
  
  // Trading activity
  totalBought: number;          // Total tokens bought
  totalSold: number;            // Total tokens sold
  buyCount: number;             // Number of buy transactions
  sellCount: number;            // Number of sell transactions
  
  // Pricing
  avgBuyPrice: number;          // Average buy price (WMON per token)
  avgSellPrice: number;         // Average sell price (WMON per token)
  
  // Profit and Loss
  realizedPnlUsd: number;       // PnL from sold tokens
  unrealizedPnlUsd: number;     // PnL from held tokens
  totalPnlUsd: number;          // Total PnL (realized + unrealized)
}

// =============================================================================
// TRADER DATA MODELS
// =============================================================================

/**
 * Trader performance metrics
 * Represents a trader with their performance across all trades
 */
export interface TraderData {
  address: string;
  rank: number;                 // 1-based ranking by totalPnlUsd
  
  // Holdings
  netTokens: number;            // Current balance
  
  // Trading activity
  totalBought: number;          // Total tokens bought
  totalSold: number;            // Total tokens sold
  buyCount: number;             // Number of buy transactions
  sellCount: number;            // Number of sell transactions
  
  // Pricing
  avgBuyPrice: number;          // Average buy price (WMON per token)
  avgSellPrice: number;         // Average sell price (WMON per token)
  
  // Profit and Loss
  realizedPnlUsd: number;       // PnL from sold tokens
  unrealizedPnlUsd: number;     // PnL from held tokens
  totalPnlUsd: number;          // Total PnL
  
  // Performance
  winRate: number;              // Percentage of profitable trades (0-100)
}

// =============================================================================
// BONDING CURVE DATA MODELS
// =============================================================================

/**
 * Bonding curve reserve information
 * Represents the current state of the bonding curve
 */
export interface BondingCurveReserves {
  // Virtual reserves (constants for Monad bonding curve)
  virtualWmonReserve: number;   // 30,000 WMON
  virtualTokenReserve: number;  // 1,000,000,000 tokens
  
  // Real reserves (from latest trade)
  realWmonReserve?: number;     // Actual WMON in curve
  realTokenReserve?: number;    // Actual tokens in curve
}

/**
 * Trading data for bonding curve
 * Used for trade preview calculations
 */
export interface TradingData {
  bondingCurve: string;         // Bonding curve contract address
  reserves: BondingCurveReserves;
  curveProgress: number;        // Progress towards completion (0-100%)
  currentPrice: number;         // Current price (WMON per token)
  marketCap: number;            // Market capitalization in USD
  liquidityUsd: number;         // Liquidity in USD
}

// =============================================================================
// TRADE DATA MODELS
// =============================================================================

/**
 * Trade transaction information
 * Represents a single trade on a token
 */
export interface TradeTransaction {
  signature: string;            // Transaction signature
  trader: string;               // Trader address
  isBuy: boolean;               // True for buy, false for sell
  wmonAmount: number;           // WMON amount
  tokenAmount: number;          // Token amount
  pricePerToken: number;        // Price per token (WMON)
  usdAmount: number;            // USD value of trade
  timestamp: Date;              // Trade timestamp
  blockNumber: number;          // Block number
  commitState: string;          // Commit state (proposed/finalized/verified)
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Base success response
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;            // ISO 8601 timestamp
}

/**
 * Base error response
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;            // Human-readable error message
    code: string;               // Machine-readable error code
    status: number;             // HTTP status code
  };
  timestamp: string;            // ISO 8601 timestamp
}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  limit: number;                // Items per page
  offset: number;               // Number of items skipped
  total: number;                // Total number of items
  hasNext: boolean;             // Whether there are more items
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T = any> extends SuccessResponse<T[]> {
  pagination: PaginationMetadata;
}

// =============================================================================
// ENDPOINT-SPECIFIC RESPONSE TYPES
// =============================================================================

/**
 * Latest tokens response
 */
export interface LatestTokensResponse extends PaginatedResponse<TokenWithStats> {
  data: TokenWithStats[];
  pagination: PaginationMetadata;
}

/**
 * Pre-bond tokens response
 */
export interface PreBondTokensResponse extends PaginatedResponse<TokenWithStats> {
  data: TokenWithStats[];
  pagination: PaginationMetadata;
}

/**
 * Token exists response
 */
export interface TokenExistsResponse extends SuccessResponse<{
  exists: boolean;
  tokenAddress: string;
}> {}

/**
 * Token overview response
 */
export interface TokenOverviewResponse extends SuccessResponse<{
  token: TokenWithMetadata;
  stats: TokenStats;
  transactions: TradeTransaction[];
}> {}

/**
 * Trading data response
 */
export interface TradingDataResponse extends SuccessResponse<TradingData> {}

/**
 * Token holders response
 */
export interface TokenHoldersResponse extends SuccessResponse<HolderData[]> {}

/**
 * Token traders response
 */
export interface TokenTradersResponse extends SuccessResponse<TraderData[]> {}

/**
 * Service statistics
 */
export interface ServiceStats {
  totalTokens: number;          // Total tokens created
  totalTrades: number;          // Total trades processed
  totalVolumeUsd: number;       // Total volume in USD
  volume24h: number;            // 24h volume in USD
  tokensCreated24h: number;     // Tokens created in last 24h
  tradesProcessed24h: number;   // Trades processed in last 24h
  avgProcessingLatency: number; // Average processing latency (ms)
  cacheHitRate?: number;        // Cache hit rate (0-100%)
  redis?: RedisStats;           // Redis-specific stats
}

/**
 * Redis statistics
 */
export interface RedisStats {
  cachedTokens: number;         // Number of cached tokens
  cachedTrades: number;         // Number of cached trades
  redisLatency: number;         // Redis latency (ms)
}

/**
 * Service statistics response
 */
export interface ServiceStatsResponse extends SuccessResponse<ServiceStats> {}

// =============================================================================
// REQUEST PARAMETER TYPES
// =============================================================================

/**
 * Pagination query parameters
 */
export interface PaginationParams {
  limit?: number;               // Items per page (default: 50, max: 100)
  offset?: number;              // Number of items to skip (default: 0)
}

/**
 * Token address parameter
 */
export interface TokenAddressParam {
  tokenAddress: string;         // Token contract address
}

// =============================================================================
// ERROR CODES
// =============================================================================

/**
 * API error codes
 */
export enum TokenApiErrorCode {
  // Validation errors (400)
  INVALID_LIMIT = 'INVALID_LIMIT',
  INVALID_OFFSET = 'INVALID_OFFSET',
  MISSING_TOKEN_ADDRESS = 'MISSING_TOKEN_ADDRESS',
  INVALID_TOKEN_ADDRESS = 'INVALID_TOKEN_ADDRESS',
  
  // Not found errors (404)
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  HOLDERS_NOT_FOUND = 'HOLDERS_NOT_FOUND',
  TRADERS_NOT_FOUND = 'TRADERS_NOT_FOUND',
  
  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Type guard to check if response is success
 */
export function isSuccessResponse<T>(
  response: SuccessResponse<T> | ErrorResponse
): response is SuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if response is error
 */
export function isErrorResponse(
  response: SuccessResponse<any> | ErrorResponse
): response is ErrorResponse {
  return response.success === false;
}
