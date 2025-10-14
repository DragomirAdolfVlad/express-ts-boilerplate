/**
 * RPC Circuit Breaker Tests
 */

import {
  getRpcCircuitBreaker,
  executeRpcCall,
  executeRpcCallWithFallback,
  isRpcEndpointAvailable,
  getRpcEndpointsHealth,
} from '../rpc-circuit-breaker';
import { CircuitBreakerState } from '../CircuitBreaker';
import { CircuitBreakerManager } from '../CircuitBreakerManager';

describe('RPC Circuit Breaker', () => {
  afterEach(() => {
    CircuitBreakerManager.getInstance().destroy();
  });

  describe('Circuit Breaker Creation', () => {
    it('should create RPC circuit breaker with default name', () => {
      const breaker = getRpcCircuitBreaker();
      
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should create RPC circuit breaker with custom name', () => {
      const breaker = getRpcCircuitBreaker('primary-rpc');
      
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return same instance for same endpoint', () => {
      const breaker1 = getRpcCircuitBreaker('primary-rpc');
      const breaker2 = getRpcCircuitBreaker('primary-rpc');
      
      expect(breaker1).toBe(breaker2);
    });

    it('should create different instances for different endpoints', () => {
      const breaker1 = getRpcCircuitBreaker('primary-rpc');
      const breaker2 = getRpcCircuitBreaker('secondary-rpc');
      
      expect(breaker1).not.toBe(breaker2);
    });
  });

  describe('Execute RPC Call', () => {
    it('should execute successful RPC call', async () => {
      const operation = jest.fn().mockResolvedValue({ blockNumber: 12345 });
      
      const result = await executeRpcCall(operation, 'primary-rpc', 'getBlock');
      
      expect(result).toEqual({ blockNumber: 12345 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle RPC failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('RPC rate limit exceeded'));
      
      await expect(executeRpcCall(operation, 'primary-rpc', 'getBlock')).rejects.toThrow(
        'RPC rate limit exceeded'
      );
    });

    it('should open circuit after threshold failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // Execute failing operations
      for (let i = 0; i < 5; i++) {
        await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow();
      }

      const breaker = getRpcCircuitBreaker('primary-rpc');
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject calls when circuit is open', async () => {
      const breaker = getRpcCircuitBreaker('primary-rpc');
      breaker.open();

      const operation = jest.fn().mockResolvedValue({ blockNumber: 12345 });
      
      await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow('CircuitBreaker');
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Execute RPC Call with Fallback', () => {
    it('should use first endpoint when available', async () => {
      const operation = jest.fn().mockResolvedValue({ blockNumber: 12345 });
      
      const result = await executeRpcCallWithFallback(
        operation,
        ['primary-rpc', 'secondary-rpc', 'tertiary-rpc'],
        'getBlock'
      );
      
      expect(result).toEqual({ blockNumber: 12345 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fallback to second endpoint on first failure', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Primary RPC failed');
        }
        return { blockNumber: 12345 };
      });
      
      const result = await executeRpcCallWithFallback(
        operation,
        ['primary-rpc', 'secondary-rpc'],
        'getBlock'
      );
      
      expect(result).toEqual({ blockNumber: 12345 });
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should skip endpoints with open circuits', async () => {
      // Open primary circuit
      const primaryBreaker = getRpcCircuitBreaker('primary-rpc');
      primaryBreaker.open();

      const operation = jest.fn().mockResolvedValue({ blockNumber: 12345 });
      
      const result = await executeRpcCallWithFallback(
        operation,
        ['primary-rpc', 'secondary-rpc'],
        'getBlock'
      );
      
      expect(result).toEqual({ blockNumber: 12345 });
      // Should only call once (skipped primary)
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw error when all endpoints fail', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('RPC failed'));
      
      await expect(
        executeRpcCallWithFallback(
          operation,
          ['primary-rpc', 'secondary-rpc'],
          'getBlock'
        )
      ).rejects.toThrow('All RPC endpoints failed');
    });

    it('should throw error when all endpoints are open', async () => {
      // Open all circuits
      getRpcCircuitBreaker('primary-rpc').open();
      getRpcCircuitBreaker('secondary-rpc').open();

      const operation = jest.fn().mockResolvedValue({ blockNumber: 12345 });
      
      await expect(
        executeRpcCallWithFallback(
          operation,
          ['primary-rpc', 'secondary-rpc'],
          'getBlock'
        )
      ).rejects.toThrow('All RPC endpoints failed');
      
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Endpoint Availability', () => {
    it('should report endpoint as available initially', () => {
      getRpcCircuitBreaker('primary-rpc');
      
      expect(isRpcEndpointAvailable('primary-rpc')).toBe(true);
    });

    it('should report endpoint as unavailable when circuit is open', () => {
      const breaker = getRpcCircuitBreaker('primary-rpc');
      breaker.open();
      
      expect(isRpcEndpointAvailable('primary-rpc')).toBe(false);
    });

    it('should get health status of all endpoints', () => {
      getRpcCircuitBreaker('primary-rpc');
      getRpcCircuitBreaker('secondary-rpc');
      getRpcCircuitBreaker('tertiary-rpc').open();

      const health = getRpcEndpointsHealth();
      
      expect(health['primary-rpc']).toBe(true);
      expect(health['secondary-rpc']).toBe(true);
      expect(health['tertiary-rpc']).toBe(false);
    });

    it('should return empty health when no RPC breakers exist', () => {
      const health = getRpcEndpointsHealth();
      
      expect(Object.keys(health)).toHaveLength(0);
    });
  });

  describe('Error Filtering', () => {
    it('should count network errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Network error'));
      
      await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow();
      
      const breaker = getRpcCircuitBreaker('primary-rpc');
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });

    it('should count rate limit errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Rate limit exceeded (429)'));
      
      await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow();
      
      const breaker = getRpcCircuitBreaker('primary-rpc');
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });

    it('should count connection refused errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow();
      
      const breaker = getRpcCircuitBreaker('primary-rpc');
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });

    it('should count service unavailable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service unavailable (503)'));
      
      await expect(executeRpcCall(operation, 'primary-rpc')).rejects.toThrow();
      
      const breaker = getRpcCircuitBreaker('primary-rpc');
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });
  });
});
