/**
 * Consistent Hashing Implementation
 * Distributes events across workers based on token address
 * Ensures events for the same token always go to the same worker
 */

import crypto from 'crypto';

export class ConsistentHash {
  private readonly virtualNodes: number;
  private readonly ring: Map<number, number>; // hash -> workerId
  private readonly sortedHashes: number[];
  private workerCount: number;

  constructor(workerCount: number, virtualNodes: number = 150) {
    this.workerCount = workerCount;
    this.virtualNodes = virtualNodes;
    this.ring = new Map();
    this.sortedHashes = [];
    
    this.buildRing();
  }

  /**
   * Build the consistent hash ring with virtual nodes
   */
  private buildRing(): void {
    this.ring.clear();
    this.sortedHashes.length = 0;

    for (let workerId = 0; workerId < this.workerCount; workerId++) {
      for (let vnode = 0; vnode < this.virtualNodes; vnode++) {
        const key = `worker-${workerId}-vnode-${vnode}`;
        const hash = this.hash(key);
        this.ring.set(hash, workerId);
        this.sortedHashes.push(hash);
      }
    }

    // Sort hashes for binary search
    this.sortedHashes.sort((a, b) => a - b);
  }

  /**
   * Hash a string to a 32-bit integer
   */
  private hash(key: string): number {
    const hash = crypto.createHash('md5').update(key).digest();
    // Use first 4 bytes as 32-bit integer
    return hash.readUInt32BE(0);
  }

  /**
   * Get worker ID for a given token address
   * @param tokenAddress - Token address to hash
   * @returns Worker ID (0 to workerCount-1)
   */
  getWorker(tokenAddress: string): number {
    if (this.workerCount === 0) {
      throw new Error('No workers available');
    }

    const hash = this.hash(tokenAddress.toLowerCase());
    
    // Binary search to find the first hash >= target hash
    let left = 0;
    let right = this.sortedHashes.length - 1;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midHash = this.sortedHashes[mid];
      if (midHash !== undefined && midHash < hash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Wrap around if needed
    const leftHash = this.sortedHashes[left];
    const firstHash = this.sortedHashes[0];
    
    if (leftHash === undefined || firstHash === undefined) {
      throw new Error('Hash ring is empty');
    }
    
    const selectedHash = leftHash >= hash ? leftHash : firstHash;

    const workerId = this.ring.get(selectedHash);
    if (workerId === undefined) {
      throw new Error('Failed to find worker for hash');
    }
    return workerId;
  }

  /**
   * Update worker count and rebuild ring
   */
  updateWorkerCount(newCount: number): void {
    if (newCount <= 0) {
      throw new Error('Worker count must be positive');
    }
    this.workerCount = newCount;
    this.buildRing();
  }

  /**
   * Get distribution statistics
   */
  getDistribution(tokenAddresses: string[]): Map<number, number> {
    const distribution = new Map<number, number>();
    
    for (let i = 0; i < this.workerCount; i++) {
      distribution.set(i, 0);
    }

    for (const address of tokenAddresses) {
      const workerId = this.getWorker(address);
      distribution.set(workerId, (distribution.get(workerId) || 0) + 1);
    }

    return distribution;
  }
}
