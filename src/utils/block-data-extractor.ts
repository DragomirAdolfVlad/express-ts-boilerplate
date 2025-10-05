/**
 * Block Data Extractor
 * 
 * Centralized utility for extracting block data from blockchain
 * Eliminates code duplication across tracker components
 */

import { JsonRpcProvider } from 'ethers';
import { BLOCKCHAIN_CONFIG } from '../config/blockchain.config';

export interface BlockData {
  number: number;
  hash: string;
  timestamp: Date;
  parentHash?: string;
}

export interface TransactionBlockData extends BlockData {
  transactionHash: string;
}

export class BlockDataExtractor {
  private blockCache = new Map<number, BlockData>();
  private lastCleanup = Date.now();

  constructor(private provider: JsonRpcProvider) {}

  /**
   * Get block data by block number with caching
   */
  async getBlockData(blockNumber: number): Promise<BlockData> {
    // Check cache first
    const cached = this.blockCache.get(blockNumber);
    if (cached) {
      return cached;
    }

    // Fetch from blockchain
    try {
      const block = await this.provider.getBlock(blockNumber);
      
      if (!block) {
        throw new Error(`Block ${blockNumber} not found`);
      }

      const blockData: BlockData = {
        number: block.number,
        hash: block.hash || 'unknown',
        timestamp: new Date(block.timestamp * 1000),
        parentHash: block.parentHash
      };

      // Cache it
      this.blockCache.set(blockNumber, blockData);
      
      // Periodic cleanup
      this.cleanupCacheIfNeeded();

      return blockData;
    } catch (error) {
      console.error(`Failed to get block ${blockNumber}:`, error);
      // Return fallback data to not break the flow
      return {
        number: blockNumber,
        hash: 'unknown',
        timestamp: new Date()
      };
    }
  }

  /**
   * Get block data from transaction receipt (most accurate)
   */
  async getBlockDataFromTransaction(txHash: string): Promise<TransactionBlockData> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        throw new Error(`Transaction ${txHash} not found`);
      }

      const blockData = await this.getBlockData(receipt.blockNumber);

      return {
        ...blockData,
        transactionHash: txHash
      };
    } catch (error) {
      console.error(`Failed to get block data from transaction ${txHash}:`, error);
      // Return fallback
      return {
        number: 0,
        hash: 'unknown',
        timestamp: new Date(),
        transactionHash: txHash
      };
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      console.error('Failed to get current block number:', error);
      // Return approximate block number based on timestamp
      return Math.floor(Date.now() / 1000 / 12); // ~12s block time
    }
  }

  /**
   * Get safe block number (lagged for safety)
   */
  async getSafeBlockNumber(): Promise<number> {
    const current = await this.getCurrentBlockNumber();
    return Math.max(0, current - BLOCKCHAIN_CONFIG.BLOCK_CONFIRMATION_BLOCKS);
  }

  /**
   * Batch get block data for multiple block numbers
   */
  async getBatchBlockData(blockNumbers: number[]): Promise<Map<number, BlockData>> {
    const results = new Map<number, BlockData>();
    const uncached: number[] = [];

    // Check cache first
    for (const blockNumber of blockNumbers) {
      const cached = this.blockCache.get(blockNumber);
      if (cached) {
        results.set(blockNumber, cached);
      } else {
        uncached.push(blockNumber);
      }
    }

    // Fetch uncached in parallel
    if (uncached.length > 0) {
      const promises = uncached.map(async (blockNumber) => {
        const blockData = await this.getBlockData(blockNumber);
        return [blockNumber, blockData] as const;
      });

      const fetched = await Promise.all(promises);
      for (const [blockNumber, blockData] of fetched) {
        results.set(blockNumber, blockData);
      }
    }

    return results;
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCacheIfNeeded(): void {
    const now = Date.now();
    
    // Only cleanup every minute
    if (now - this.lastCleanup < BLOCKCHAIN_CONFIG.CACHE_CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanup = now;

    // Keep only recent blocks (last 1000)
    if (this.blockCache.size > BLOCKCHAIN_CONFIG.BLOCK_CACHE_SIZE) {
      const entries = Array.from(this.blockCache.entries());
      entries.sort((a, b) => b[0] - a[0]); // Sort by block number descending
      
      // Keep only the most recent blocks
      const toKeep = entries.slice(0, BLOCKCHAIN_CONFIG.BLOCK_CACHE_SIZE);
      this.blockCache.clear();
      
      for (const [blockNumber, blockData] of toKeep) {
        this.blockCache.set(blockNumber, blockData);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.blockCache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.blockCache.size,
      maxSize: BLOCKCHAIN_CONFIG.BLOCK_CACHE_SIZE
    };
  }
}
