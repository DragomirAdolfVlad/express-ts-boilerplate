/**
 * Circuit Breaker Manager Tests
 */

import { CircuitBreakerManager } from '../CircuitBreakerManager';
import { CircuitBreakerState } from '../CircuitBreaker';

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = CircuitBreakerManager.getInstance();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = CircuitBreakerManager.getInstance();
      const instance2 = CircuitBreakerManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should create new circuit breaker', () => {
      const breaker = manager.getOrCreate({
        name: 'test-breaker',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return existing circuit breaker', () => {
      const breaker1 = manager.getOrCreate({
        name: 'test-breaker',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const breaker2 = manager.getOrCreate({
        name: 'test-breaker',
        failureThreshold: 10, // Different config
        resetTimeout: 2000,
      });

      expect(breaker1).toBe(breaker2);
    });

    it('should get circuit breaker by name', () => {
      manager.getOrCreate({
        name: 'test-breaker',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const breaker = manager.get('test-breaker');
      expect(breaker).toBeDefined();
      expect(breaker?.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return undefined for non-existent breaker', () => {
      const breaker = manager.get('non-existent');
      expect(breaker).toBeUndefined();
    });

    it('should get all circuit breakers', () => {
      manager.getOrCreate({
        name: 'breaker-1',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      manager.getOrCreate({
        name: 'breaker-2',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const all = manager.getAll();
      expect(all.size).toBe(2);
      expect(all.has('breaker-1')).toBe(true);
      expect(all.has('breaker-2')).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should get metrics for all breakers', async () => {
      const breaker1 = manager.getOrCreate({
        name: 'breaker-1',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      const breaker2 = manager.getOrCreate({
        name: 'breaker-2',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      // Execute some operations
      await breaker1.execute(async () => 'success');
      await breaker2.execute(async () => 'success');

      const metrics = manager.getAllMetrics();
      
      expect(metrics['breaker-1']).toBeDefined();
      expect(metrics['breaker-1']?.totalCalls).toBe(1);
      expect(metrics['breaker-2']).toBeDefined();
      expect(metrics['breaker-2']?.totalCalls).toBe(1);
    });

    it('should return empty metrics when no breakers exist', () => {
      const metrics = manager.getAllMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });
  });

  describe('Reset Operations', () => {
    it('should reset all circuit breakers', async () => {
      const breaker1 = manager.getOrCreate({
        name: 'breaker-1',
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      const breaker2 = manager.getOrCreate({
        name: 'breaker-2',
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      // Open both circuits
      const failOp = async () => {
        throw new Error('Failed');
      };

      for (let i = 0; i < 2; i++) {
        await expect(breaker1.execute(failOp)).rejects.toThrow();
        await expect(breaker2.execute(failOp)).rejects.toThrow();
      }

      expect(breaker1.getState()).toBe(CircuitBreakerState.OPEN);
      expect(breaker2.getState()).toBe(CircuitBreakerState.OPEN);

      // Reset all
      manager.resetAll();

      expect(breaker1.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Cleanup', () => {
    it('should destroy all circuit breakers', () => {
      manager.getOrCreate({
        name: 'breaker-1',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      manager.getOrCreate({
        name: 'breaker-2',
        failureThreshold: 5,
        resetTimeout: 1000,
      });

      expect(manager.getAll().size).toBe(2);

      manager.destroy();

      expect(manager.getAll().size).toBe(0);
    });
  });
});
