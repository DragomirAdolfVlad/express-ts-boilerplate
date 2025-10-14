/**
 * Unit tests for BatchWriter
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BatchWriter, BatchWriterConfig } from './batch-writer';
import { MonadTrade } from '../../domain/entities/monad-token.entity';
import * as fs from 'fs';
import * as path from 'path';

// Mock pg module
jest.mock('pg', () => {
    const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
    };
    
    const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
        end: jest.fn().mockResolvedValue(undefined)
    };
    
    return {
        Pool: jest.fn(() => mockPool)
    };
});

describe('BatchWriter', () => {
    let batchWriter: BatchWriter;
    let config: BatchWriterConfig;
    const testWalPath = path.join(process.cwd(), 'test-data', 'test-wal.log');
    
    beforeEach(() => {
        // Clean up test WAL file
        if (fs.existsSync(testWalPath)) {
            fs.unlinkSync(testWalPath);
        }
        
        config = {
            connectionString: 'postgresql://test:test@localhost:5432/test',
            poolMin: 10,
            poolMax: 20,
            batchSize: 100,
            flushIntervalMs: 1000,
            walEnabled: true,
            walPath: testWalPath,
            preparedStatements: true
        };
    });
    
    afterEach(async () => {
        if (batchWriter) {
            await batchWriter.shutdown();
        }
        
        // Clean up test WAL file
        if (fs.existsSync(testWalPath)) {
            fs.unlinkSync(testWalPath);
        }
    });
    
    describe('Initialization', () => {
        it('should initialize with default config', () => {
            batchWriter = new BatchWriter({
                connectionString: 'postgresql://test:test@localhost:5432/test'
            });
            
            const stats = batchWriter.getStats();
            expect(stats.batchSize).toBe(1000); // Default batch size
            expect(stats.pendingWrites).toBe(0);
            expect(stats.totalWrites).toBe(0);
        });
        
        it('should initialize with custom config', () => {
            batchWriter = new BatchWriter(config);
            
            const stats = batchWriter.getStats();
            expect(stats.batchSize).toBe(100);
            expect(stats.pendingWrites).toBe(0);
        });
        
        it('should throw error if connection string is missing', () => {
            expect(() => {
                new BatchWriter({} as BatchWriterConfig);
            }).toThrow('Database connection string is required');
        });
    });
    
    describe('Trade Accumulation', () => {
        beforeEach(() => {
            batchWriter = new BatchWriter(config);
        });
        
        it('should add trade to buffer', () => {
            const trade = createMockTrade();
            
            batchWriter.addTrade(trade);
            
            const stats = batchWriter.getStats();
            expect(stats.pendingWrites).toBe(1);
        });
        
        it('should accumulate multiple trades', () => {
            for (let i = 0; i < 10; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            const stats = batchWriter.getStats();
            expect(stats.pendingWrites).toBe(10);
        });
        
        it('should handle buffer full scenario', async () => {
            // Fill buffer to capacity
            for (let i = 0; i < config.batchSize!; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Wait for auto-flush
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const stats = batchWriter.getStats();
            expect(stats.pendingWrites).toBeLessThan(config.batchSize!);
        });
    });
    
    describe('Batch Flushing', () => {
        beforeEach(() => {
            batchWriter = new BatchWriter(config);
        });
        
        it('should flush empty buffer without error', async () => {
            await expect(batchWriter.flush()).resolves.not.toThrow();
        });
        
        it('should flush trades to database', async () => {
            // Add trades
            for (let i = 0; i < 10; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Flush
            await batchWriter.flush();
            
            const stats = batchWriter.getStats();
            expect(stats.pendingWrites).toBe(0);
            expect(stats.totalWrites).toBe(10);
        });
        
        it('should track flush time', async () => {
            // Add trades
            for (let i = 0; i < 10; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Flush
            await batchWriter.flush();
            
            const stats = batchWriter.getStats();
            expect(stats.lastFlushTime).toBeGreaterThan(0);
            expect(stats.averageFlushTime).toBeGreaterThan(0);
        });
        
        it('should auto-flush on batch size', async () => {
            // Add trades up to batch size
            for (let i = 0; i < config.batchSize!; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Wait for auto-flush
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const stats = batchWriter.getStats();
            expect(stats.totalWrites).toBeGreaterThan(0);
        });
        
        it('should auto-flush on timer', async () => {
            // Add a few trades
            for (let i = 0; i < 5; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Wait for flush interval
            await new Promise(resolve => setTimeout(resolve, config.flushIntervalMs! + 100));
            
            const stats = batchWriter.getStats();
            expect(stats.totalWrites).toBe(5);
        });
    });
    
    describe('Statistics', () => {
        beforeEach(() => {
            batchWriter = new BatchWriter(config);
        });
        
        it('should track total writes', async () => {
            for (let i = 0; i < 20; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            await batchWriter.flush();
            
            const stats = batchWriter.getStats();
            expect(stats.totalWrites).toBe(20);
        });
        
        it('should track pending writes', () => {
            for (let i = 0; i < 15; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            const stats = batchWriter.getStats();
            expect(stats.pendingWrites).toBe(15);
        });
        
        it('should calculate writes per second', async () => {
            // Add and flush trades
            for (let i = 0; i < 10; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            await batchWriter.flush();
            
            const stats = batchWriter.getStats();
            expect(stats.writesPerSecond).toBeGreaterThanOrEqual(0);
        });
    });
    
    describe('Graceful Shutdown', () => {
        beforeEach(() => {
            batchWriter = new BatchWriter(config);
        });
        
        it('should flush pending trades on shutdown', async () => {
            // Add trades
            for (let i = 0; i < 10; i++) {
                const trade = createMockTrade();
                batchWriter.addTrade(trade);
            }
            
            // Shutdown
            await batchWriter.shutdown();
            
            const stats = batchWriter.getStats();
            expect(stats.totalWrites).toBe(10);
        });
        
        it('should reject new trades after shutdown', async () => {
            await batchWriter.shutdown();
            
            const trade = createMockTrade();
            expect(() => {
                batchWriter.addTrade(trade);
            }).toThrow('BatchWriter is shutting down');
        });
    });
    
    describe('Error Handling', () => {
        beforeEach(() => {
            batchWriter = new BatchWriter(config);
        });
        
        it('should track failed writes', async () => {
            // Mock database error
            const { Pool } = require('pg');
            const mockPool = new Pool();
            const mockClient = await mockPool.connect();
            mockClient.query.mockRejectedValueOnce(new Error('Database error'));
            
            // Add trade
            const trade = createMockTrade();
            batchWriter.addTrade(trade);
            
            // Try to flush (should fail)
            try {
                await batchWriter.flush();
            } catch (error) {
                // Expected error
            }
            
            const stats = batchWriter.getStats();
            expect(stats.failedWrites).toBeGreaterThan(0);
        });
    });
});

/**
 * Helper function to create mock trade
 */
function createMockTrade(): MonadTrade {
    return new MonadTrade({
        tokenAddress: '0x1234567890123456789012345678901234567890',
        trader: '0x0987654321098765432109876543210987654321',
        isBuy: true,
        wmonAmount: BigInt('1000000000000000000'), // 1 WMON
        tokenAmount: BigInt('100000000000000000000'), // 100 tokens
        pricePerToken: BigInt('10000000000000000'), // 0.01 WMON per token
        reserves: {
            reserve1: BigInt('1000000000000000000000'), // 1000 WMON
            reserve2: BigInt('100000000000000000000000'), // 100,000 tokens
            reserve3: BigInt('30000000000000000000000'), // 30,000 WMON virtual
            reserve4: BigInt('1000000000000000000000000000') // 1B tokens virtual
        },
        blockNumber: '12345',
        blockId: 'block-12345',
        commitState: 'finalized',
        timestamp: new Date(),
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        logIndex: 0,
        usdAmount: 1.5
    });
}
