/**
 * Lock-Free Ring Buffer using SharedArrayBuffer
 * High-performance circular buffer for event queue
 * Uses atomic operations for thread-safe access
 */

import { DecodedEvent } from '../binary-event-decoder';

export class RingBuffer {
  private readonly buffer: SharedArrayBuffer;
  private readonly metadata: Int32Array;
  private readonly dataView: DataView;
  private readonly size: number;
  private readonly itemSize: number;

  // Metadata offsets in Int32Array
  private static readonly HEAD_OFFSET = 0;
  private static readonly TAIL_OFFSET = 1;
  private static readonly COUNT_OFFSET = 2;

  // Each event serialized as JSON string with max length
  private static readonly MAX_EVENT_SIZE = 2048; // 2KB per event

  constructor(size: number = 10000) {
    this.size = size;
    this.itemSize = RingBuffer.MAX_EVENT_SIZE;

    // Allocate shared memory: metadata (12 bytes) + event data
    const metadataSize = 12; // 3 x Int32
    const dataSize = size * this.itemSize;
    this.buffer = new SharedArrayBuffer(metadataSize + dataSize);

    // Metadata array for atomic operations
    this.metadata = new Int32Array(this.buffer, 0, 3);
    
    // Data view for event storage
    this.dataView = new DataView(this.buffer, metadataSize);

    // Initialize metadata
    Atomics.store(this.metadata, RingBuffer.HEAD_OFFSET, 0);
    Atomics.store(this.metadata, RingBuffer.TAIL_OFFSET, 0);
    Atomics.store(this.metadata, RingBuffer.COUNT_OFFSET, 0);
  }

  /**
   * Push event to ring buffer (non-blocking)
   * @returns true if successful, false if buffer is full
   */
  push(event: DecodedEvent): boolean {
    const count = Atomics.load(this.metadata, RingBuffer.COUNT_OFFSET);
    
    if (count >= this.size) {
      return false; // Buffer full
    }

    // Get current tail position
    const tail = Atomics.load(this.metadata, RingBuffer.TAIL_OFFSET);
    
    // Serialize event to JSON with BigInt support
    const eventJson = JSON.stringify(event, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    if (eventJson.length > this.itemSize - 4) {
      console.warn('Event too large for ring buffer, truncating');
    }

    // Write event length (4 bytes) + event data
    const offset = tail * this.itemSize;
    this.dataView.setUint32(offset, eventJson.length, true);
    
    // Write event string as UTF-8 bytes
    const encoder = new TextEncoder();
    const encoded = encoder.encode(eventJson);
    const maxLength = Math.min(encoded.length, this.itemSize - 4);
    
    for (let i = 0; i < maxLength; i++) {
      const byte = encoded[i];
      if (byte !== undefined) {
        this.dataView.setUint8(offset + 4 + i, byte);
      }
    }

    // Update tail and count atomically
    const newTail = (tail + 1) % this.size;
    Atomics.store(this.metadata, RingBuffer.TAIL_OFFSET, newTail);
    Atomics.add(this.metadata, RingBuffer.COUNT_OFFSET, 1);

    return true;
  }

  /**
   * Pop event from ring buffer (non-blocking)
   * @returns event or null if buffer is empty
   */
  pop(): DecodedEvent | null {
    const count = Atomics.load(this.metadata, RingBuffer.COUNT_OFFSET);
    
    if (count === 0) {
      return null; // Buffer empty
    }

    // Get current head position
    const head = Atomics.load(this.metadata, RingBuffer.HEAD_OFFSET);
    
    // Read event length
    const offset = head * this.itemSize;
    const length = this.dataView.getUint32(offset, true);

    if (length === 0 || length > this.itemSize - 4) {
      console.error('Invalid event length in ring buffer');
      // Skip this slot
      const newHead = (head + 1) % this.size;
      Atomics.store(this.metadata, RingBuffer.HEAD_OFFSET, newHead);
      Atomics.sub(this.metadata, RingBuffer.COUNT_OFFSET, 1);
      return null;
    }

    // Read event string
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.dataView.getUint8(offset + 4 + i);
    }

    const decoder = new TextDecoder();
    const eventJson = decoder.decode(bytes);

    // Update head and count atomically
    const newHead = (head + 1) % this.size;
    Atomics.store(this.metadata, RingBuffer.HEAD_OFFSET, newHead);
    Atomics.sub(this.metadata, RingBuffer.COUNT_OFFSET, 1);

    try {
      return JSON.parse(eventJson) as DecodedEvent;
    } catch (error) {
      console.error('Failed to parse event from ring buffer:', error);
      return null;
    }
  }

  /**
   * Get current queue depth
   */
  getCount(): number {
    return Atomics.load(this.metadata, RingBuffer.COUNT_OFFSET);
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.getCount() === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.getCount() >= this.size;
  }

  /**
   * Get buffer capacity
   */
  getCapacity(): number {
    return this.size;
  }

  /**
   * Get shared buffer for worker threads
   */
  getSharedBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  /**
   * Clear the buffer (not thread-safe, use only during initialization)
   */
  clear(): void {
    Atomics.store(this.metadata, RingBuffer.HEAD_OFFSET, 0);
    Atomics.store(this.metadata, RingBuffer.TAIL_OFFSET, 0);
    Atomics.store(this.metadata, RingBuffer.COUNT_OFFSET, 0);
  }
}
