/**
 * Database Circuit Breaker Wrapper
 * 
 * Wraps database operations with circuit breaker protection
 */

import { CircuitBreaker } from './CircuitBreaker';
import { CircuitBreakerManager } from './CircuitBreakerManager';
import { log as logger } from '../../utils/logger';

// Database-specific error filter
function isDatabaseError(error: Error): boolean {
  // Count connection errors, timeouts, and database-specific errors
  const errorPatterns = [
    /connection/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /database/i,
    /postgres/i,
    /prisma/i,
  ];

  return errorPatterns.some((pattern) => pattern.test(error.message));
}

/**
 * Get or create database write circuit breaker
 */
export function getDatabaseWriteCircuitBreaker(): CircuitBreaker {
  const manager = CircuitBreakerManager.getInstance();
  return manager.getOrCreate({
    name: 'database-write',
    failureThreshold: 10, // 10 failures in window
    resetTimeout: 30000, // 30 seconds
    successThreshold: 3, // 3 successful calls to close
    timeout: 5000, // 5 second timeout per operation
    errorFilter: isDatabaseError,
  });
}

/**
 * Get or create database read circuit breaker
 */
export function getDatabaseReadCircuitBreaker(): CircuitBreaker {
  const manager = CircuitBreakerManager.getInstance();
  return manager.getOrCreate({
    name: 'database-read',
    failureThreshold: 15, // More lenient for reads
    resetTimeout: 20000, // 20 seconds
    successThreshold: 2,
    timeout: 3000, // 3 second timeout
    errorFilter: isDatabaseError,
  });
}

/**
 * Execute database write operation with circuit breaker
 */
export async function executeDatabaseWrite<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  const breaker = getDatabaseWriteCircuitBreaker();
  
  try {
    return await breaker.execute(operation);
  } catch (error) {
    logger.error('Database write operation failed', {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
      circuitState: breaker.getState(),
    });
    throw error;
  }
}

/**
 * Execute database read operation with circuit breaker
 */
export async function executeDatabaseRead<T>(
  operation: () => Promise<T>,
  operationName?: string
): Promise<T> {
  const breaker = getDatabaseReadCircuitBreaker();
  
  try {
    return await breaker.execute(operation);
  } catch (error) {
    logger.error('Database read operation failed', {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
      circuitState: breaker.getState(),
    });
    throw error;
  }
}

/**
 * Check if database operations are available
 */
export function isDatabaseAvailable(): {
  write: boolean;
  read: boolean;
} {
  const writeBreaker = getDatabaseWriteCircuitBreaker();
  const readBreaker = getDatabaseReadCircuitBreaker();
  
  return {
    write: writeBreaker.isAvailable(),
    read: readBreaker.isAvailable(),
  };
}
