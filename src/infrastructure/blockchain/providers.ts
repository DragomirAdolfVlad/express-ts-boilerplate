/**
 * Blockchain Providers Configuration
 * 
 * Robust provider setup with fallback and proper error handling
 */

import { JsonRpcProvider, FallbackProvider, WebSocketProvider } from 'ethers';

// Monad Testnet Chain ID
const MONAD_CHAIN_ID = 10143;

// Network configuration
const MONAD_NETWORK = {
  chainId: MONAD_CHAIN_ID,
  name: 'monad-testnet'
};

// HTTP Providers with fallback
const httpProviders = [
  new JsonRpcProvider(process.env.MONAD_HTTP_URL, MONAD_NETWORK),
  // Add more endpoints here if available
  // new JsonRpcProvider(process.env.MONAD_HTTP_URL_2, MONAD_NETWORK),
];

// Export HTTP provider (with fallback if multiple endpoints)
export const httpProvider = httpProviders.length > 1 
  ? new FallbackProvider(httpProviders, 1) // quorum = 1
  : httpProviders[0];

// WebSocket provider for real-time events
export const wsProvider = process.env.MONAD_WS_URL 
  ? new WebSocketProvider(process.env.MONAD_WS_URL, MONAD_NETWORK)
  : null;

// Health check function
export async function checkProviderHealth(): Promise<{
  http: boolean;
  ws: boolean;
  chainId?: number;
  blockNumber?: number;
  error?: string;
}> {
  const result = {
    http: false,
    ws: false,
    chainId: undefined as number | undefined,
    blockNumber: undefined as number | undefined,
    error: undefined as string | undefined
  };

  try {
    // Test HTTP provider
    const network = await httpProvider.getNetwork();
    const blockNumber = await httpProvider.getBlockNumber();
    
    result.http = true;
    result.chainId = Number(network.chainId);
    result.blockNumber = blockNumber;
    
    console.log(`✅ HTTP Provider: Chain ${result.chainId}, Block ${result.blockNumber}`);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error('❌ HTTP Provider failed:', result.error);
  }

  try {
    // Test WebSocket provider if available
    if (wsProvider) {
      await wsProvider.getNetwork();
      result.ws = true;
      console.log('✅ WebSocket Provider: Connected');
    }
  } catch (error) {
    console.error('❌ WebSocket Provider failed:', error instanceof Error ? error.message : String(error));
  }

  return result;
}

// Retry configuration
export const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 500, // ms
  maxDelay: 30000, // ms
  backoffFactor: 2,
  jitter: true
};

// Exponential backoff with jitter
export function calculateDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, attempt),
    RETRY_CONFIG.maxDelay
  );
  
  if (RETRY_CONFIG.jitter) {
    return delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
  }
  
  return delay;
}

// Retry wrapper for provider calls
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === RETRY_CONFIG.maxAttempts - 1) {
        console.error(`❌ ${context} failed after ${RETRY_CONFIG.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }
      
      const delay = calculateDelay(attempt);
      console.warn(`⚠️  ${context} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}