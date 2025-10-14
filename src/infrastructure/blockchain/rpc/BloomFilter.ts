/**
 * Bloom Filter Implementation
 * 
 * Space-efficient probabilistic data structure to test whether an element is a member of a set.
 * Used to skip blocks with no relevant events.
 * 
 * Requirement 11.6: Use bloom filters to skip blocks with no relevant events
 */

import { createHash } from 'crypto';

export class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;
  
  /**
   * Create a new Bloom Filter
   * @param expectedElements - Expected number of elements
   * @param falsePositiveRate - Desired false positive rate (e.g., 0.01 for 1%)
   */
  constructor(expectedElements: number, falsePositiveRate: number) {
    // Calculate optimal size and hash count
    this.size = this.calculateOptimalSize(expectedElements, falsePositiveRate);
    this.hashCount = this.calculateOptimalHashCount(this.size, expectedElements);
    
    // Initialize bit array
    const byteSize = Math.ceil(this.size / 8);
    this.bitArray = new Uint8Array(byteSize);
  }
  
  /**
   * Calculate optimal bit array size
   * Formula: m = -(n * ln(p)) / (ln(2)^2)
   */
  private calculateOptimalSize(n: number, p: number): number {
    return Math.ceil(-(n * Math.log(p)) / (Math.log(2) ** 2));
  }
  
  /**
   * Calculate optimal number of hash functions
   * Formula: k = (m/n) * ln(2)
   */
  private calculateOptimalHashCount(m: number, n: number): number {
    return Math.ceil((m / n) * Math.log(2));
  }
  
  /**
   * Generate hash values for an element
   */
  private hash(element: string): number[] {
    const hashes: number[] = [];
    
    // Use double hashing technique: h_i(x) = h1(x) + i * h2(x)
    const hash1 = this.hashFunction(element, 0);
    const hash2 = this.hashFunction(element, 1);
    
    for (let i = 0; i < this.hashCount; i++) {
      const hash = (hash1 + i * hash2) % this.size;
      hashes.push(Math.abs(hash));
    }
    
    return hashes;
  }
  
  /**
   * Hash function using crypto
   */
  private hashFunction(element: string, seed: number): number {
    const hash = createHash('sha256');
    hash.update(element + seed.toString());
    const digest = hash.digest();
    
    // Convert first 4 bytes to number
    return (
      ((digest[0] || 0) << 24) |
      ((digest[1] || 0) << 16) |
      ((digest[2] || 0) << 8) |
      (digest[3] || 0)
    );
  }
  
  /**
   * Add an element to the bloom filter
   */
  add(element: string): void {
    const hashes = this.hash(element);
    
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      const currentByte = this.bitArray[byteIndex] || 0;
      this.bitArray[byteIndex] = currentByte | (1 << bitIndex);
    }
  }
  
  /**
   * Check if an element might be in the set
   * @returns true if element might be present, false if definitely not present
   */
  contains(element: string): boolean {
    const hashes = this.hash(element);
    
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      const byte = this.bitArray[byteIndex];
      
      if (byte === undefined || (byte & (1 << bitIndex)) === 0) {
        return false; // Definitely not present
      }
    }
    
    return true; // Might be present
  }
  
  /**
   * Clear the bloom filter
   */
  clear(): void {
    this.bitArray.fill(0);
  }
  
  /**
   * Get the current false positive rate estimate
   */
  estimateFalsePositiveRate(insertedElements: number): number {
    // Formula: (1 - e^(-k*n/m))^k
    const exponent = -(this.hashCount * insertedElements) / this.size;
    return Math.pow(1 - Math.exp(exponent), this.hashCount);
  }
  
  /**
   * Get bloom filter statistics
   */
  getStats(): {
    size: number;
    hashCount: number;
    byteSize: number;
    bitsSet: number;
    fillRatio: number;
  } {
    let bitsSet = 0;
    
    for (let i = 0; i < this.bitArray.length; i++) {
      const byte = this.bitArray[i];
      if (byte !== undefined) {
        for (let j = 0; j < 8; j++) {
          if (byte & (1 << j)) {
            bitsSet++;
          }
        }
      }
    }
    
    return {
      size: this.size,
      hashCount: this.hashCount,
      byteSize: this.bitArray.length,
      bitsSet,
      fillRatio: bitsSet / this.size
    };
  }
  
  /**
   * Serialize bloom filter to buffer
   */
  serialize(): Buffer {
    return Buffer.from(this.bitArray);
  }
  
  /**
   * Deserialize bloom filter from buffer
   */
  static deserialize(
    buffer: Buffer,
    expectedElements: number,
    falsePositiveRate: number
  ): BloomFilter {
    const filter = new BloomFilter(expectedElements, falsePositiveRate);
    filter.bitArray = new Uint8Array(buffer);
    return filter;
  }
}
