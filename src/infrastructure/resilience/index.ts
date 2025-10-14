/**
 * Resilience Infrastructure
 * 
 * Circuit breaker pattern implementation for fault tolerance
 */

export {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
} from './CircuitBreaker';

export { CircuitBreakerManager } from './CircuitBreakerManager';

export {
  getDatabaseWriteCircuitBreaker,
  getDatabaseReadCircuitBreaker,
  executeDatabaseWrite,
  executeDatabaseRead,
  isDatabaseAvailable,
} from './database-circuit-breaker';

export {
  getRpcCircuitBreaker,
  executeRpcCall,
  executeRpcCallWithFallback,
  isRpcEndpointAvailable,
  getRpcEndpointsHealth,
} from './rpc-circuit-breaker';
