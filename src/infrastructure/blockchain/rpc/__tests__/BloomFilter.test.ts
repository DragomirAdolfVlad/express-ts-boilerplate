/**
 * Tests for BloomFilter
 */

import { BloomFilter } from '../BloomFilter';

describe('BloomFilter', () => {
  describe('Basic Operations', () => {
    it('should create bloom filter with correct size', () => {
      const filter = new BloomFilter(1000, 0.01);
      const stats = filter.getStats();
      
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hashCount).toBeGreaterThan(0);
      expect(stats.bitsSet).toBe(0);
    });
    
    it('should add and check elements', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      filter.add('element1');
      filter.add('element2');
      filter.add('element3');
      
      expect(filter.contains('element1')).toBe(true);
      expect(filter.contains('element2')).toBe(true);
      expect(filter.contains('element3')).toBe(true);
    });
    
    it('should return false for elements not added', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      filter.add('element1');
      
      expect(filter.contains('element1')).toBe(true);
      expect(filter.contains('element2')).toBe(false);
      expect(filter.contains('element3')).toBe(false);
    });
    
    it('should clear all elements', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      filter.add('element1');
      filter.add('element2');
      
      expect(filter.contains('element1')).toBe(true);
      
      filter.clear();
      
      expect(filter.contains('element1')).toBe(false);
      expect(filter.contains('element2')).toBe(false);
      
      const stats = filter.getStats();
      expect(stats.bitsSet).toBe(0);
    });
  });
  
  describe('Block Skipping Use Case', () => {
    it('should efficiently track blocks with events', () => {
      const filter = new BloomFilter(10000, 0.01);
      const contractAddress = '0x1234567890123456789012345678901234567890';
      
      // Add blocks that have events
      const blocksWithEvents = [1000, 1005, 1010, 1020, 1050];
      
      for (const block of blocksWithEvents) {
        filter.add(`${block}:${contractAddress}`);
      }
      
      // Check blocks
      expect(filter.contains(`1000:${contractAddress}`)).toBe(true);
      expect(filter.contains(`1005:${contractAddress}`)).toBe(true);
      expect(filter.contains(`1001:${contractAddress}`)).toBe(false);
      expect(filter.contains(`1002:${contractAddress}`)).toBe(false);
    });
    
    it('should skip blocks without events', () => {
      const filter = new BloomFilter(10000, 0.01);
      const contractAddress = '0x1234567890123456789012345678901234567890';
      
      // Simulate scanning 1000 blocks, only 10 have events
      const blocksWithEvents = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
      
      for (const block of blocksWithEvents) {
        filter.add(`${block}:${contractAddress}`);
      }
      
      // Count how many blocks we would skip
      let skipped = 0;
      let checked = 0;
      
      for (let block = 1; block <= 1000; block++) {
        if (!filter.contains(`${block}:${contractAddress}`)) {
          skipped++;
        } else {
          checked++;
        }
      }
      
      // Should skip most blocks (allowing for false positives)
      expect(skipped).toBeGreaterThan(900);
      expect(checked).toBeLessThan(100);
    });
  });
  
  describe('False Positive Rate', () => {
    it('should have low false positive rate', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      // Add 500 elements
      for (let i = 0; i < 500; i++) {
        filter.add(`element${i}`);
      }
      
      // Check 500 elements that were not added
      let falsePositives = 0;
      for (let i = 500; i < 1000; i++) {
        if (filter.contains(`element${i}`)) {
          falsePositives++;
        }
      }
      
      const falsePositiveRate = falsePositives / 500;
      
      // Should be close to configured rate (0.01 = 1%)
      expect(falsePositiveRate).toBeLessThan(0.05); // Allow up to 5%
    });
    
    it('should estimate false positive rate', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      // Add elements
      for (let i = 0; i < 500; i++) {
        filter.add(`element${i}`);
      }
      
      const estimatedRate = filter.estimateFalsePositiveRate(500);
      
      expect(estimatedRate).toBeGreaterThan(0);
      expect(estimatedRate).toBeLessThan(0.1);
    });
  });
  
  describe('Statistics', () => {
    it('should track fill ratio', () => {
      const filter = new BloomFilter(1000, 0.01);
      
      const statsBefore = filter.getStats();
      expect(statsBefore.fillRatio).toBe(0);
      
      // Add elements
      for (let i = 0; i < 100; i++) {
        filter.add(`element${i}`);
      }
      
      const statsAfter = filter.getStats();
      expect(statsAfter.fillRatio).toBeGreaterThan(0);
      expect(statsAfter.fillRatio).toBeLessThan(1);
      expect(statsAfter.bitsSet).toBeGreaterThan(0);
    });
  });
  
  describe('Serialization', () => {
    it('should serialize and deserialize', () => {
      const filter1 = new BloomFilter(1000, 0.01);
      
      filter1.add('element1');
      filter1.add('element2');
      filter1.add('element3');
      
      // Serialize
      const buffer = filter1.serialize();
      expect(buffer).toBeInstanceOf(Buffer);
      
      // Deserialize
      const filter2 = BloomFilter.deserialize(buffer, 1000, 0.01);
      
      // Should contain same elements
      expect(filter2.contains('element1')).toBe(true);
      expect(filter2.contains('element2')).toBe(true);
      expect(filter2.contains('element3')).toBe(true);
      expect(filter2.contains('element4')).toBe(false);
    });
  });
  
  describe('Performance', () => {
    it('should handle large number of elements efficiently', () => {
      const filter = new BloomFilter(100000, 0.01);
      
      const startTime = process.hrtime.bigint();
      
      // Add 10,000 elements
      for (let i = 0; i < 10000; i++) {
        filter.add(`element${i}`);
      }
      
      const addTime = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      
      // Check 10,000 elements
      const checkStartTime = process.hrtime.bigint();
      
      for (let i = 0; i < 10000; i++) {
        filter.contains(`element${i}`);
      }
      
      const checkTime = Number(process.hrtime.bigint() - checkStartTime) / 1_000_000;
      
      // Should be fast (< 100ms for 10k operations)
      expect(addTime).toBeLessThan(100);
      expect(checkTime).toBeLessThan(100);
      
      console.log(`Add time: ${addTime.toFixed(2)}ms`);
      console.log(`Check time: ${checkTime.toFixed(2)}ms`);
    });
  });
});
