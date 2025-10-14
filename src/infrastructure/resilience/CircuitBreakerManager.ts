/**
 * Circuit Breaker Manager
 * 
 * Centralized management of circuit breakers for different operations
 */

import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerMetrics } from './CircuitBreaker';
import { log as logger } from '../../utils/logger';

export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private breakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Create or get a circuit breaker
   */
  getOrCreate(config: CircuitBreakerConfig): CircuitBreaker {
    if (this.breakers.has(config.name)) {
      return this.breakers.get(config.name)!;
    }

    const breaker = new CircuitBreaker(config);
    this.breakers.set(config.name, breaker);
    logger.info(`CircuitBreaker [${config.name}] registered`);
    return breaker;
  }

  /**
   * Get existing circuit breaker
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    logger.info('Resetting all circuit breakers');
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Cleanup all circuit breakers
   */
  destroy(): void {
    logger.info('Destroying all circuit breakers');
    for (const breaker of this.breakers.values()) {
      breaker.destroy();
    }
    this.breakers.clear();
  }
}
