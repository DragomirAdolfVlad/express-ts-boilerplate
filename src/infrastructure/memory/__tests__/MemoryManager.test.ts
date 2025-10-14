/**
 * MemoryManager Unit Tests
 * 
 * Tests object pooling, buffer management, and memory statistics
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MemoryManager } from '../MemoryManager';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  
  beforeEach(() => {
    // Get singleton instance (will be created on first test)
    memoryManager = MemoryManager.getInstance();
    memoryManager.resetStats();
  });
  
  afterEach(() => {
    // Don't shutdown - singleton persists across tests
  });
  
  describe('Trade Object Pool', () => {
    it('should acquire trade object from pool', () => {
      const trade = memoryManager.acquireTrade();
      
      expect(trade).toBeDefined();
      expect(trade.tokenAddress).toBe('');
      expect(trade.wmonAmount).toBe(0);
      
      const stats = memoryManager.getStats();
      expect(stats.acquisitions).toBe(1);
      expect(stats.activeObjects).toBe(1);
    });
    
    it('should release trade object back to pool', () => {
      const initialStats = memoryManager.getStats();
      const initialActive = initialStats.activeObjects;
      
      const trade = memoryManager.acquireTrade();
      trade.tokenAddress = '0x123';
      trade.wmonAmount = 1000;
      
      memoryManager.releaseTrade(trade);
      
      // Object should be cleared
      expect(trade.tokenAddress).toBe('');
      expect(trade.wmonAmount).toBe(0);
      
      const stats = memoryManager.getStats();
      expect(stats.releases).toBe(1);
      expect(stats.activeObjects).toBe(initialActive); // Back to initial state
    });
    
    it('should reuse released objects', () => {
      const trade1 = memoryManager.acquireTrade();
      const trade1Ref = trade1;
      
      memoryManager.releaseTrade(trade1);
      
      const trade2 = memoryManager.acquireTrade();
      
      // Should be the same object (reused)
      expect(trade2).toBe(trade1Ref);
    });
    
    it('should handle multiple acquisitions and releases', () => {
      const initialStats = memoryManager.getStats();
      const initialActive = initialStats.activeObjects;
      
      const trades: any[] = [];
      
      // Acquire 10 trades
      for (let i = 0; i < 10; i++) {
        trades.push(memoryManager.acquireTrade());
      }
      
      let stats = memoryManager.getStats();
      expect(stats.activeObjects).toBe(initialActive + 10);
      
      // Release all trades
      for (const trade of trades) {
        memoryManager.releaseTrade(trade);
      }
      
      stats = memoryManager.getStats();
      expect(stats.activeObjects).toBe(initialActive);
      expect(stats.acquisitions).toBe(10);
      expect(stats.releases).toBe(10);
    });
    
    it('should handle pool exhaustion gracefully', () => {
      const trades: any[] = [];
      
      // Acquire more than pool size (100)
      for (let i = 0; i < 110; i++) {
        trades.push(memoryManager.acquireTrade());
      }
      
      expect(trades.length).toBe(110);
      
      // All should be valid objects
      for (const trade of trades) {
        expect(trade).toBeDefined();
      }
    });
  });
  
  describe('Buffer Pool', () => {
    it('should acquire buffer from pool', () => {
      const buffer = memoryManager.acquireBuffer(1024);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThanOrEqual(1024);
      
      const stats = memoryManager.getStats();
      expect(stats.bufferAcquisitions).toBe(1);
    });
    
    it('should release buffer back to pool', () => {
      const buffer = memoryManager.acquireBuffer(1024);
      memoryManager.releaseBuffer(buffer);
      
      const stats = memoryManager.getStats();
      expect(stats.bufferReleases).toBe(1);
    });
    
    it('should reuse released buffers', () => {
      const buffer1 = memoryManager.acquireBuffer(1024);
      const buffer1Ref = buffer1;
      
      memoryManager.releaseBuffer(buffer1);
      
      const buffer2 = memoryManager.acquireBuffer(1024);
      
      // Should be the same buffer (reused)
      expect(buffer2).toBe(buffer1Ref);
    });
    
    it('should handle different buffer sizes', () => {
      const sizes = [256, 1024, 4096, 16384, 65536];
      
      for (const size of sizes) {
        const buffer = memoryManager.acquireBuffer(size);
        expect(buffer.length).toBeGreaterThanOrEqual(size);
        memoryManager.releaseBuffer(buffer);
      }
    });
    
    it('should allocate new buffer for non-standard size', () => {
      const buffer = memoryManager.acquireBuffer(500);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThanOrEqual(500);
    });
  });
  
  describe('Memory Statistics', () => {
    it('should track acquisitions and releases', () => {
      const initialStats = memoryManager.getStats();
      const initialActive = initialStats.activeObjects;
      
      const trade1 = memoryManager.acquireTrade();
      const trade2 = memoryManager.acquireTrade();
      
      const trade3 = memoryManager.acquireTrade();
      memoryManager.releaseTrade(trade3);
      
      const stats = memoryManager.getStats();
      expect(stats.acquisitions).toBe(3);
      expect(stats.releases).toBe(1);
      expect(stats.activeObjects).toBe(initialActive + 2);
      
      // Cleanup
      memoryManager.releaseTrade(trade1);
      memoryManager.releaseTrade(trade2);
    });
    
    it('should track buffer operations', () => {
      const buffer1 = memoryManager.acquireBuffer(1024);
      memoryManager.acquireBuffer(4096);
      
      memoryManager.releaseBuffer(buffer1);
      
      const stats = memoryManager.getStats();
      expect(stats.bufferAcquisitions).toBe(2);
      expect(stats.bufferReleases).toBe(1);
    });
    
    it('should report memory usage', () => {
      const stats = memoryManager.getStats();
      
      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapTotal).toBeGreaterThan(0);
      expect(stats.rss).toBeGreaterThan(0);
    });
    
    it('should report pool sizes', () => {
      const stats = memoryManager.getStats();
      
      expect(stats.poolSize).toBe(10000); // Default pool size
      expect(stats.bufferPoolSize).toBeGreaterThan(0);
    });
  });
  
  describe('Performance', () => {
    it('should acquire/release trades quickly', () => {
      const iterations = 1000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const trade = memoryManager.acquireTrade();
        memoryManager.releaseTrade(trade);
      }
      
      const duration = performance.now() - start;
      const avgTime = duration / iterations;
      
      // Should be < 0.01ms per operation
      expect(avgTime).toBeLessThan(0.01);
    });
    
    it('should handle high concurrency', () => {
      const initialStats = memoryManager.getStats();
      const initialActive = initialStats.activeObjects;
      
      const trades: any[] = [];
      
      // Acquire 50 trades rapidly
      for (let i = 0; i < 50; i++) {
        trades.push(memoryManager.acquireTrade());
      }
      
      // Release all
      for (const trade of trades) {
        memoryManager.releaseTrade(trade);
      }
      
      const stats = memoryManager.getStats();
      expect(stats.activeObjects).toBe(initialActive);
    });
  });
});
