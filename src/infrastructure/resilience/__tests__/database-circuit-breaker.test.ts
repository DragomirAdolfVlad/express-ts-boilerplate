/**
 * Database Circuit Breaker Tests
 */

import {
  getDatabaseWriteCircuitBreaker,
  getDatabaseReadCircuitBreaker,
  executeDatabaseWrite,
  executeDatabaseRead,
  isDatabaseAvailable,
} from '../database-circuit-breaker';
import { CircuitBreakerState } from '../CircuitBreaker';
import { CircuitBreakerManager } from '../CircuitBreakerManager';

describe('Database Circuit Breaker', () => {
  afterEach(() => {
    CircuitBreakerManager.getInstance().destroy();
  });

  describe('Circuit Breaker Creation', () => {
    it('should create database write circuit breaker', () => {
      const breaker = getDatabaseWriteCircuitBreaker();
      
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should create database read circuit breaker', () => {
      const breaker = getDatabaseReadCircuitBreaker();
      
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return same instance on multiple calls', () => {
      const breaker1 = getDatabaseWriteCircuitBreaker();
      const breaker2 = getDatabaseWriteCircuitBreaker();
      
      expect(breaker1).toBe(breaker2);
    });
  });

  describe('Execute Database Write', () => {
    it('should execute successful write operation', async () => {
      const operation = jest.fn().mockResolvedValue({ id: 1 });
      
      const result = await executeDatabaseWrite(operation, 'test-write');
      
      expect(result).toEqual({ id: 1 });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle write failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      
      await expect(executeDatabaseWrite(operation, 'test-write')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should open circuit after threshold failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Connection timeout'));
      
      // Execute failing operations
      for (let i = 0; i < 10; i++) {
        await expect(executeDatabaseWrite(operation)).rejects.toThrow();
      }

      const breaker = getDatabaseWriteCircuitBreaker();
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject calls when circuit is open', async () => {
      const breaker = getDatabaseWriteCircuitBreaker();
      breaker.open();

      const operation = jest.fn().mockResolvedValue({ id: 1 });
      
      await expect(executeDatabaseWrite(operation)).rejects.toThrow('CircuitBreaker');
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Execute Database Read', () => {
    it('should execute successful read operation', async () => {
      const operation = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
      
      const result = await executeDatabaseRead(operation, 'test-read');
      
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle read failures', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Query timeout'));
      
      await expect(executeDatabaseRead(operation, 'test-read')).rejects.toThrow(
        'Query timeout'
      );
    });
  });

  describe('Database Availability', () => {
    it('should report both as available initially', () => {
      const availability = isDatabaseAvailable();
      
      expect(availability.write).toBe(true);
      expect(availability.read).toBe(true);
    });

    it('should report write unavailable when circuit is open', () => {
      const breaker = getDatabaseWriteCircuitBreaker();
      breaker.open();

      const availability = isDatabaseAvailable();
      
      expect(availability.write).toBe(false);
      expect(availability.read).toBe(true);
    });

    it('should report read unavailable when circuit is open', () => {
      const breaker = getDatabaseReadCircuitBreaker();
      breaker.open();

      const availability = isDatabaseAvailable();
      
      expect(availability.write).toBe(true);
      expect(availability.read).toBe(false);
    });
  });

  describe('Error Filtering', () => {
    it('should count database connection errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      
      await expect(executeDatabaseWrite(operation)).rejects.toThrow();
      
      const breaker = getDatabaseWriteCircuitBreaker();
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });

    it('should count timeout errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      
      await expect(executeDatabaseWrite(operation)).rejects.toThrow();
      
      const breaker = getDatabaseWriteCircuitBreaker();
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });

    it('should count Prisma errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Prisma query failed'));
      
      await expect(executeDatabaseWrite(operation)).rejects.toThrow();
      
      const breaker = getDatabaseWriteCircuitBreaker();
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(1);
    });
  });
});
