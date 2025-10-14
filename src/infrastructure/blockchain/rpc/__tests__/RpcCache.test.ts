/**
 * Tests for RpcCache
 */

import { RpcCache } from '../RpcCache';

describe('RpcCache', () => {
  describe('Local Cache (No Redis)', () => {
    let cache: RpcCache;
    
    beforeEach(() => {
      cache = new RpcCache({
        enabled: true,
        ttl: 2, // 2 seconds
        redisUrl: undefined // No Redis
      });
    });
    
    afterEach(async () => {
      await cache.shutdown();
    });
    
    it('should store and retrieve values', async () => {
      await cache.set('key1', { value: 'test1' });
      await cache.set('key2', { value: 'test2' });
      
      const value1 = await cache.get('key1');
      const value2 = await cache.get('key2');
      
      expect(value1).toEqual({ value: 'test1' });
      expect(value2).toEqual({ value: 'test2' });
    });
    
    it('should return null for non-existent keys', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });
    
    it('should respect TTL', async () => {
      await cache.set('key1', { value: 'test' }, 1); // 1 second TTL
      
      const value1 = await cache.get('key1');
      expect(value1).toEqual({ value: 'test' });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const value2 = await cache.get('key1');
      expect(value2).toBeNull();
    });
    
    it('should delete values', async () => {
      await cache.set('key1', { value: 'test' });
      
      const value1 = await cache.get('key1');
      expect(value1).toEqual({ value: 'test' });
      
      await cache.delete('key1');
      
      const value2 = await cache.get('key1');
      expect(value2).toBeNull();
    });
    
    it('should clear all values', async () => {
      await cache.set('key1', { value: 'test1' });
      await cache.set('key2', { value: 'test2' });
      await cache.set('key3', { value: 'test3' });
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();
    });
    
    it('should track cache statistics', async () => {
      await cache.set('key1', { value: 'test' });
      
      await cache.get('key1'); // Hit
      await cache.get('key1'); // Hit
      await cache.get('key2'); // Miss
      await cache.get('key3'); // Miss
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });
    
    it('should limit local cache size', async () => {
      // Add more than 10,000 items
      for (let i = 0; i < 11000; i++) {
        await cache.set(`key${i}`, { value: `test${i}` });
      }
      
      const stats = cache.getStats();
      
      // Should have removed oldest entries
      expect(stats.localCacheSize).toBeLessThanOrEqual(10000);
    });
  });
  
  describe('Cache Disabled', () => {
    let cache: RpcCache;
    
    beforeEach(() => {
      cache = new RpcCache({
        enabled: false,
        ttl: 2
      });
    });
    
    afterEach(async () => {
      await cache.shutdown();
    });
    
    it('should not cache when disabled', async () => {
      await cache.set('key1', { value: 'test' });
      
      const value = await cache.get('key1');
      expect(value).toBeNull();
    });
  });
  
  describe('RPC Use Cases', () => {
    let cache: RpcCache;
    
    beforeEach(() => {
      cache = new RpcCache({
        enabled: true,
        ttl: 3 // 3 seconds
      });
    });
    
    afterEach(async () => {
      await cache.shutdown();
    });
    
    it('should cache block data', async () => {
      const blockData = {
        number: 12345,
        hash: '0xabc123',
        timestamp: 1234567890,
        transactions: []
      };
      
      await cache.set('block:12345', blockData);
      
      const cached = await cache.get('block:12345');
      expect(cached).toEqual(blockData);
    });
    
    it('should cache logs', async () => {
      const logs = [
        { address: '0x123', topics: ['0xabc'], data: '0x456' },
        { address: '0x789', topics: ['0xdef'], data: '0x012' }
      ];
      
      await cache.set('logs:12345:0x123', logs);
      
      const cached = await cache.get('logs:12345:0x123');
      expect(cached).toEqual(logs);
    });
    
    it('should cache transaction receipts', async () => {
      const receipt = {
        transactionHash: '0xabc123',
        blockNumber: 12345,
        status: 1,
        logs: []
      };
      
      await cache.set('receipt:0xabc123', receipt);
      
      const cached = await cache.get('receipt:0xabc123');
      expect(cached).toEqual(receipt);
    });
  });
  
  describe('Performance', () => {
    let cache: RpcCache;
    
    beforeEach(() => {
      cache = new RpcCache({
        enabled: true,
        ttl: 5
      });
    });
    
    afterEach(async () => {
      await cache.shutdown();
    });
    
    it('should handle high throughput', async () => {
      const startTime = process.hrtime.bigint();
      
      // Set 1000 values
      const setPromises = [];
      for (let i = 0; i < 1000; i++) {
        setPromises.push(cache.set(`key${i}`, { value: `test${i}` }));
      }
      await Promise.all(setPromises);
      
      const setTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      
      // Get 1000 values
      const getStartTime = process.hrtime.bigint();
      
      const getPromises = [];
      for (let i = 0; i < 1000; i++) {
        getPromises.push(cache.get(`key${i}`));
      }
      await Promise.all(getPromises);
      
      const getTime = Number(process.hrtime.bigint() - getStartTime) / 1_000_000;
      
      console.log(`Set 1000 values: ${setTime.toFixed(2)}ms`);
      console.log(`Get 1000 values: ${getTime.toFixed(2)}ms`);
      
      // Should be fast
      expect(setTime).toBeLessThan(100);
      expect(getTime).toBeLessThan(50);
    });
  });
});
