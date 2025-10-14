/**
 * Circuit Breaker Tests
 */

import { CircuitBreaker, CircuitBreakerState } from '../CircuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
      timeout: 500,
    });
  });

  afterEach(() => {
    breaker.destroy();
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(breaker.isAvailable()).toBe(true);
    });

    it('should transition to OPEN after threshold failures', async () => {
      const failingOp = async () => {
        throw new Error('Operation failed');
      };

      // Execute failing operations
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingOp)).rejects.toThrow('Operation failed');
      }

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(breaker.isAvailable()).toBe(false);
    });

    it('should reject calls immediately when OPEN', async () => {
      // Force circuit to OPEN
      breaker.open();

      const operation = jest.fn().mockResolvedValue('success');
      
      await expect(breaker.execute(operation)).rejects.toThrow('CircuitBreaker');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Open the circuit
      breaker.open();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      const successOp = async () => 'success';

      // Open circuit
      breaker.open();
      
      // Wait for HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Execute successful operations
      await breaker.execute(successOp);
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      const failingOp = async () => {
        throw new Error('Failed');
      };

      // Open circuit
      breaker.open();
      
      // Wait for HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(breaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Execute failing operation
      await expect(breaker.execute(failingOp)).rejects.toThrow('Failed');

      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Failure Counting', () => {
    it('should count failures correctly', async () => {
      const failingOp = async () => {
        throw new Error('Failed');
      };

      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(2);
      expect(metrics.totalFailures).toBe(2);
    });

    it('should reset failure count on success in CLOSED state', async () => {
      const failingOp = async () => {
        throw new Error('Failed');
      };
      const successOp = async () => 'success';

      // Add some failures
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      expect(breaker.getMetrics().failureCount).toBe(2);

      // Success should reset failure count
      await breaker.execute(successOp);

      expect(breaker.getMetrics().failureCount).toBe(0);
    });

    it('should not count filtered errors', async () => {
      const breakerWithFilter = new CircuitBreaker({
        name: 'filtered-breaker',
        failureThreshold: 3,
        resetTimeout: 1000,
        errorFilter: (error) => error.message.includes('count'),
      });

      const countedError = async () => {
        throw new Error('This should count');
      };
      const ignoredError = async () => {
        throw new Error('This should be ignored');
      };

      await expect(breakerWithFilter.execute(ignoredError)).rejects.toThrow();
      expect(breakerWithFilter.getMetrics().failureCount).toBe(0);

      await expect(breakerWithFilter.execute(countedError)).rejects.toThrow();
      expect(breakerWithFilter.getMetrics().failureCount).toBe(1);

      breakerWithFilter.destroy();
    });
  });

  describe('Timeout Behavior', () => {
    it('should timeout long-running operations', async () => {
      const slowOp = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return 'success';
      };

      await expect(breaker.execute(slowOp)).rejects.toThrow('timeout');
    });

    it('should not timeout fast operations', async () => {
      const fastOp = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      };

      const result = await breaker.execute(fastOp);
      expect(result).toBe('success');
    });

    it('should work without timeout configured', async () => {
      const noTimeoutBreaker = new CircuitBreaker({
        name: 'no-timeout',
        failureThreshold: 3,
        resetTimeout: 1000,
      });

      const slowOp = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'success';
      };

      const result = await noTimeoutBreaker.execute(slowOp);
      expect(result).toBe('success');

      noTimeoutBreaker.destroy();
    });
  });

  describe('Metrics', () => {
    it('should track total calls', async () => {
      const operation = async () => 'success';

      await breaker.execute(operation);
      await breaker.execute(operation);
      await breaker.execute(operation);

      const metrics = breaker.getMetrics();
      expect(metrics.totalCalls).toBe(3);
      expect(metrics.totalSuccesses).toBe(3);
    });

    it('should track successes and failures separately', async () => {
      const successOp = async () => 'success';
      const failOp = async () => {
        throw new Error('Failed');
      };

      await breaker.execute(successOp);
      await expect(breaker.execute(failOp)).rejects.toThrow();
      await breaker.execute(successOp);

      const metrics = breaker.getMetrics();
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
    });

    it('should track last failure time', async () => {
      const failOp = async () => {
        throw new Error('Failed');
      };

      const beforeTime = Date.now();
      await expect(breaker.execute(failOp)).rejects.toThrow();
      const afterTime = Date.now();

      const metrics = breaker.getMetrics();
      expect(metrics.lastFailureTime).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.lastFailureTime).toBeLessThanOrEqual(afterTime);
    });

    it('should track open count', async () => {
      const failOp = async () => {
        throw new Error('Failed');
      };

      // Open circuit first time
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failOp)).rejects.toThrow();
      }
      expect(breaker.getMetrics().openCount).toBe(1);

      // Reset and open again
      breaker.reset();
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failOp)).rejects.toThrow();
      }
      expect(breaker.getMetrics().openCount).toBe(2);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual reset', async () => {
      const failOp = async () => {
        throw new Error('Failed');
      };

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failOp)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should allow manual open', () => {
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
      
      breaker.open();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Edge Cases', () => {
    it('should handle synchronous errors', async () => {
      const syncError = async () => {
        throw new Error('Sync error');
      };

      await expect(breaker.execute(syncError)).rejects.toThrow('Sync error');
      expect(breaker.getMetrics().totalFailures).toBe(1);
    });

    it('should handle successful operations returning falsy values', async () => {
      const falsyOp = async () => null;

      const result = await breaker.execute(falsyOp);
      expect(result).toBeNull();
      expect(breaker.getMetrics().totalSuccesses).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'success';
      };

      const promises = Array(10)
        .fill(null)
        .map(() => breaker.execute(operation));

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(breaker.getMetrics().totalSuccesses).toBe(10);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup timers on destroy', () => {
      breaker.open();
      
      // Timer should be set
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      breaker.destroy();
      
      // Should not transition after destroy
      setTimeout(() => {
        expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
      }, 1100);
    });
  });
});
