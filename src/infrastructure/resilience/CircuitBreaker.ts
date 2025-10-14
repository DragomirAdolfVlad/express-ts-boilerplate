/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides fault tolerance by preventing cascading failures.
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 */

import { log as logger } from '../../utils/logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Name for logging and metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery (OPEN -> HALF_OPEN) */
  resetTimeout: number;
  /** Number of successful calls in HALF_OPEN before closing */
  successThreshold?: number;
  /** Timeout for individual operations in ms */
  timeout?: number;
  /** Custom error filter - return true to count as failure */
  errorFilter?: (error: Error) => boolean;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  openCount: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalCalls: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: number = Date.now();
  private openCount: number = 0;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(private config: CircuitBreakerConfig) {
    this.config.successThreshold = config.successThreshold ?? 1;
    logger.info(`CircuitBreaker [${config.name}] initialized`, {
      failureThreshold: config.failureThreshold,
      resetTimeout: config.resetTimeout,
      successThreshold: this.config.successThreshold,
    });
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      const error = new Error(
        `CircuitBreaker [${this.config.name}] is OPEN - rejecting call`
      );
      error.name = 'CircuitBreakerOpenError';
      throw error;
    }

    try {
      // Apply timeout if configured
      const result = this.config.timeout
        ? await this.executeWithTimeout(operation, this.config.timeout)
        : await operation();

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timeout after ${timeout}ms`)),
          timeout
        )
      ),
    ]);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.totalSuccesses++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      logger.debug(
        `CircuitBreaker [${this.config.name}] success in HALF_OPEN (${this.successCount}/${this.config.successThreshold})`
      );

      if (this.successCount >= this.config.successThreshold!) {
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    // Check if error should be counted (if filter provided)
    if (this.config.errorFilter && !this.config.errorFilter(error)) {
      logger.debug(
        `CircuitBreaker [${this.config.name}] error filtered out: ${error.message}`
      );
      return;
    }

    this.failureCount++;

    logger.warn(`CircuitBreaker [${this.config.name}] failure detected`, {
      error: error.message,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state,
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately opens circuit
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (
      this.state === CircuitBreakerState.CLOSED &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionTo(CircuitBreakerState.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    logger.info(`CircuitBreaker [${this.config.name}] state transition`, {
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
      successCount: this.successCount,
    });

    // Clear any existing timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    // Handle state-specific logic
    switch (newState) {
      case CircuitBreakerState.OPEN:
        this.openCount++;
        this.scheduleReset();
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successCount = 0;
        this.failureCount = 0;
        break;

      case CircuitBreakerState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        break;
    }
  }

  /**
   * Schedule automatic transition from OPEN to HALF_OPEN
   */
  private scheduleReset(): void {
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitBreakerState.OPEN) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
    }, this.config.resetTimeout);
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   */
  reset(): void {
    logger.info(`CircuitBreaker [${this.config.name}] manually reset`);
    this.transitionTo(CircuitBreakerState.CLOSED);
  }

  /**
   * Force circuit breaker to OPEN state
   */
  open(): void {
    logger.warn(`CircuitBreaker [${this.config.name}] manually opened`);
    this.transitionTo(CircuitBreakerState.OPEN);
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      openCount: this.openCount,
    };
  }

  /**
   * Check if circuit breaker is available (not OPEN)
   */
  isAvailable(): boolean {
    return this.state !== CircuitBreakerState.OPEN;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
