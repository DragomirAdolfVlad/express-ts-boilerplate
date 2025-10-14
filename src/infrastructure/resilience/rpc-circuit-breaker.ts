/**
 * RPC Circuit Breaker Wrapper
 * 
 * Wraps RPC calls with circuit breaker protection
 */

import { CircuitBreaker } from './CircuitBreaker';
import { CircuitBreakerManager } from './CircuitBreakerManager';
import { log as logger } from '../../utils/logger';

// RPC-specific error filter
function isRpcError(error: Error): boolean {
  // Count network errors, rate limits, and RPC-specific errors
  const errorPatterns = [
    /network/i,
    /rate limit/i,
    /too many requests/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /rpc/i,
    /provider/i,
    /429/,
    /503/,
  ];

  return errorPatterns.some((pattern) => pattern.test(error.message));
}

/**
 * Get or create RPC circuit breaker for a specific endpoint
 */
export function getRpcCircuitBreaker(endpointName: string = 'default'): CircuitBreaker {
  const manager = CircuitBreakerManager.getInstance();
  return manager.getOrCreate({
    name: `rpc-${endpointName}`,
    failureThreshold: 5, // 5 failures before opening
    resetTimeout: 10000, // 10 seconds
    successThreshold: 2, // 2 successful calls to close
    timeout: 10000, // 10 second timeout for RPC calls
    errorFilter: isRpcError,
  });
}

/**
 * Execute RPC call with circuit breaker protection
 */
export async function executeRpcCall<T>(
  operation: () => Promise<T>,
  endpointName?: string,
  operationName?: string
): Promise<T> {
  const breaker = getRpcCircuitBreaker(endpointName);
  
  try {
    return await breaker.execute(operation);
  } catch (error) {
    logger.error('RPC call failed', {
      endpoint: endpointName,
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
      circuitState: breaker.getState(),
    });
    throw error;
  }
}

/**
 * Execute RPC call with automatic fallback to alternative endpoints
 */
export async function executeRpcCallWithFallback<T>(
  operation: () => Promise<T>,
  endpoints: string[],
  operationName?: string
): Promise<T> {
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const breaker = getRpcCircuitBreaker(endpoint);
    
    // Skip if circuit is open
    if (!breaker.isAvailable()) {
      logger.debug(`Skipping endpoint ${endpoint} - circuit is OPEN`);
      continue;
    }

    try {
      return await breaker.execute(operation);
    } catch (error) {
      lastError = error as Error;
      logger.warn(`RPC call failed on endpoint ${endpoint}, trying next`, {
        endpoint,
        operation: operationName,
        error: lastError.message,
      });
    }
  }

  // All endpoints failed
  const error = new Error(
    `All RPC endpoints failed for operation: ${operationName || 'unknown'}`
  );
  if (lastError) {
    error.cause = lastError;
  }
  throw error;
}

/**
 * Check if RPC endpoint is available
 */
export function isRpcEndpointAvailable(endpointName: string = 'default'): boolean {
  const breaker = getRpcCircuitBreaker(endpointName);
  return breaker.isAvailable();
}

/**
 * Get health status of all RPC endpoints
 */
export function getRpcEndpointsHealth(): Record<string, boolean> {
  const manager = CircuitBreakerManager.getInstance();
  const health: Record<string, boolean> = {};
  
  for (const [name, breaker] of manager.getAll()) {
    if (name.startsWith('rpc-')) {
      const endpointName = name.replace('rpc-', '');
      health[endpointName] = breaker.isAvailable();
    }
  }
  
  return health;
}
