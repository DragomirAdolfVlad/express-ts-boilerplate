/**
 * Binary Event Decoder
 * 
 * Ultra-fast custom event decoder that parses raw hex data without ethers.js
 * Target: 0.1ms per event (100x faster than ethers.js)
 * 
 * Performance optimizations:
 * - Pre-computed event topic hashes
 * - Direct buffer slicing for zero-copy parsing
 * - No JSON serialization
 * - Fallback to ethers.js on decode failure
 */

import { ethers } from 'ethers';
import { BONDING_CURVE_ABI, BONDING_CURVE_EVENTS } from './abis/official-nad-fun.abi';

// Pre-computed event topic hashes (computed at module initialization)
let EVENT_TOPICS: {
  CurveCreate: string;
  CurveBuy: string;
  CurveSell: string;
} | null = null;

// Initialize topic hashes
async function initializeTopicHashes(): Promise<void> {
  if (EVENT_TOPICS) return;
  
  EVENT_TOPICS = {
    CurveCreate: ethers.id(BONDING_CURVE_EVENTS.CurveCreate),
    CurveBuy: ethers.id(BONDING_CURVE_EVENTS.CurveBuy),
    CurveSell: ethers.id(BONDING_CURVE_EVENTS.CurveSell)
  };
}

// Decoded event types
export interface CurveBuyEvent {
  name: 'CurveBuy';
  sender: string;
  token: string;
  amountIn: bigint;
  amountOut: bigint;
}

export interface CurveSellEvent {
  name: 'CurveSell';
  sender: string;
  token: string;
  amountIn: bigint;
  amountOut: bigint;
}

export interface CurveCreateEvent {
  name: 'CurveCreate';
  creator: string;
  token: string;
  pool: string;
  tokenName: string;
  symbol: string;
  tokenURI: string;
  virtualMon: bigint;
  virtualToken: bigint;
  targetTokenAmount: bigint;
}

export type DecodedEvent = CurveBuyEvent | CurveSellEvent | CurveCreateEvent;

export interface RawLog {
  topics: string[];
  data: string;
  address: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
}

/**
 * Binary Event Decoder Class
 * 
 * Parses raw blockchain event logs using direct buffer operations
 * for maximum performance
 */
export class BinaryEventDecoder {
  private ethersInterface: ethers.Interface;
  private topicsInitialized = false;

  constructor() {
    // Keep ethers.js interface for fallback
    this.ethersInterface = new ethers.Interface(BONDING_CURVE_ABI);
  }

  /**
   * Initialize event topic hashes (call once at startup)
   */
  async initialize(): Promise<void> {
    if (this.topicsInitialized) return;
    await initializeTopicHashes();
    this.topicsInitialized = true;
  }

  /**
   * Decode CurveBuy event from raw log data
   * 
   * Event signature: CurveBuy(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)
   * - topics[0]: event signature hash
   * - topics[1]: sender (indexed)
   * - topics[2]: token (indexed)
   * - data: amountIn (32 bytes) + amountOut (32 bytes)
   */
  decodeCurveBuy(topics: string[], data: string): CurveBuyEvent | null {
    try {
      if (!EVENT_TOPICS) {
        throw new Error('Topics not initialized');
      }

      // Validate topic count
      if (topics.length !== 3) {
        return null;
      }

      // Validate event signature
      if (topics[0] !== EVENT_TOPICS.CurveBuy) {
        return null;
      }

      // Extract indexed parameters (addresses from topics)
      // Topics are 32 bytes, addresses are last 20 bytes
      const sender = '0x' + topics[1]!.slice(-40);
      const token = '0x' + topics[2]!.slice(-40);

      // Parse data field (remove '0x' prefix)
      const dataHex = data.slice(2);
      
      // Validate data length (should be 64 bytes = 128 hex chars)
      if (dataHex.length !== 128) {
        return null;
      }

      // Extract uint256 values using direct buffer slicing
      // amountIn: bytes 0-31 (hex chars 0-63)
      // amountOut: bytes 32-63 (hex chars 64-127)
      const amountIn = BigInt('0x' + dataHex.slice(0, 64));
      const amountOut = BigInt('0x' + dataHex.slice(64, 128));

      return {
        name: 'CurveBuy',
        sender,
        token,
        amountIn,
        amountOut
      };
    } catch (error) {
      // Return null on any parsing error
      return null;
    }
  }

  /**
   * Decode CurveSell event from raw log data
   * 
   * Event signature: CurveSell(address indexed sender, address indexed token, uint256 amountIn, uint256 amountOut)
   * - topics[0]: event signature hash
   * - topics[1]: sender (indexed)
   * - topics[2]: token (indexed)
   * - data: amountIn (32 bytes) + amountOut (32 bytes)
   */
  decodeCurveSell(topics: string[], data: string): CurveSellEvent | null {
    try {
      if (!EVENT_TOPICS) {
        throw new Error('Topics not initialized');
      }

      // Validate topic count
      if (topics.length !== 3) {
        return null;
      }

      // Validate event signature
      if (topics[0] !== EVENT_TOPICS.CurveSell) {
        return null;
      }

      // Extract indexed parameters (addresses from topics)
      const sender = '0x' + topics[1]!.slice(-40);
      const token = '0x' + topics[2]!.slice(-40);

      // Parse data field
      const dataHex = data.slice(2);
      
      // Validate data length
      if (dataHex.length !== 128) {
        return null;
      }

      // Extract uint256 values
      const amountIn = BigInt('0x' + dataHex.slice(0, 64));
      const amountOut = BigInt('0x' + dataHex.slice(64, 128));

      return {
        name: 'CurveSell',
        sender,
        token,
        amountIn,
        amountOut
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode CurveCreate event from raw log data
   * 
   * Event signature: CurveCreate(address indexed creator, address indexed token, address indexed pool, 
   *                              string name, string symbol, string tokenURI, 
   *                              uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)
   * - topics[0]: event signature hash
   * - topics[1]: creator (indexed)
   * - topics[2]: token (indexed)
   * - topics[3]: pool (indexed)
   * - data: name, symbol, tokenURI (dynamic strings), virtualMon, virtualToken, targetTokenAmount (uint256s)
   */
  decodeCurveCreate(topics: string[], data: string): CurveCreateEvent | null {
    try {
      if (!EVENT_TOPICS) {
        throw new Error('Topics not initialized');
      }

      // Validate topic count
      if (topics.length !== 4) {
        return null;
      }

      // Validate event signature
      if (topics[0] !== EVENT_TOPICS.CurveCreate) {
        return null;
      }

      // Extract indexed parameters (addresses from topics)
      const creator = '0x' + topics[1]!.slice(-40);
      const token = '0x' + topics[2]!.slice(-40);
      const pool = '0x' + topics[3]!.slice(-40);

      // Parse data field - this is complex due to dynamic strings
      // For CurveCreate, we'll use a hybrid approach:
      // - Extract addresses from topics (fast)
      // - Use ethers.js for complex string parsing (acceptable for token creation events)
      const dataHex = data.slice(2);
      
      // Validate minimum data length (at least offsets for 3 strings + 3 uint256s)
      if (dataHex.length < 192) { // 6 * 32 bytes = 192 hex chars
        return null;
      }

      // Parse dynamic data using ABI decoding
      // Offset 0: name offset (32 bytes)
      // Offset 32: symbol offset (32 bytes)
      // Offset 64: tokenURI offset (32 bytes)
      // Offset 96: virtualMon (32 bytes)
      // Offset 128: virtualToken (32 bytes)
      // Offset 160: targetTokenAmount (32 bytes)
      
      const nameOffset = parseInt(dataHex.slice(0, 64), 16) * 2;
      const symbolOffset = parseInt(dataHex.slice(64, 128), 16) * 2;
      const tokenURIOffset = parseInt(dataHex.slice(128, 192), 16) * 2;
      
      // Extract uint256 values (fixed position)
      const virtualMon = BigInt('0x' + dataHex.slice(192, 256));
      const virtualToken = BigInt('0x' + dataHex.slice(256, 320));
      const targetTokenAmount = BigInt('0x' + dataHex.slice(320, 384));

      // Decode strings from their offsets
      const tokenName = this.decodeString(dataHex, nameOffset);
      const symbol = this.decodeString(dataHex, symbolOffset);
      const tokenURI = this.decodeString(dataHex, tokenURIOffset);

      return {
        name: 'CurveCreate',
        creator,
        token,
        pool,
        tokenName,
        symbol,
        tokenURI,
        virtualMon,
        virtualToken,
        targetTokenAmount
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode a string from ABI-encoded data
   * 
   * String encoding:
   * - First 32 bytes: length
   * - Following bytes: UTF-8 string data (padded to 32-byte boundary)
   */
  private decodeString(dataHex: string, offset: number): string {
    try {
      // Read length (first 32 bytes at offset)
      const lengthHex = dataHex.slice(offset, offset + 64);
      const length = parseInt(lengthHex, 16);
      
      // Read string data (next N bytes)
      const stringHex = dataHex.slice(offset + 64, offset + 64 + (length * 2));
      
      // Convert hex to UTF-8 string
      const bytes = Buffer.from(stringHex, 'hex');
      return bytes.toString('utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * Batch decode multiple events
   * 
   * @param logs - Array of raw logs
   * @returns Array of decoded events (nulls filtered out)
   */
  decodeBatch(logs: RawLog[]): DecodedEvent[] {
    const decoded: DecodedEvent[] = [];

    for (const log of logs) {
      const event = this.decode(log.topics, log.data);
      if (event) {
        decoded.push(event);
      }
    }

    return decoded;
  }

  /**
   * Decode a single event (auto-detect type)
   * 
   * @param topics - Event topics
   * @param data - Event data
   * @returns Decoded event or null
   */
  decode(topics: string[], data: string): DecodedEvent | null {
    if (!EVENT_TOPICS || topics.length === 0) {
      return null;
    }

    const eventSignature = topics[0];

    // Try binary decoding first
    let decoded: DecodedEvent | null = null;

    if (eventSignature === EVENT_TOPICS.CurveBuy) {
      decoded = this.decodeCurveBuy(topics, data);
    } else if (eventSignature === EVENT_TOPICS.CurveSell) {
      decoded = this.decodeCurveSell(topics, data);
    } else if (eventSignature === EVENT_TOPICS.CurveCreate) {
      decoded = this.decodeCurveCreate(topics, data);
    }

    // Fallback to ethers.js if binary decode fails
    if (!decoded) {
      decoded = this.fallbackDecode(topics, data);
    }

    return decoded;
  }

  /**
   * Fallback to ethers.js decoder if binary decode fails
   * 
   * @param topics - Event topics
   * @param data - Event data
   * @returns Decoded event or null
   */
  private fallbackDecode(topics: string[], data: string): DecodedEvent | null {
    try {
      const parsed = this.ethersInterface.parseLog({ topics, data });
      
      if (!parsed) {
        return null;
      }

      // Convert ethers.js result to our format
      if (parsed.name === 'CurveBuy') {
        return {
          name: 'CurveBuy',
          sender: parsed.args['sender'],
          token: parsed.args['token'],
          amountIn: parsed.args['amountIn'],
          amountOut: parsed.args['amountOut']
        };
      } else if (parsed.name === 'CurveSell') {
        return {
          name: 'CurveSell',
          sender: parsed.args['sender'],
          token: parsed.args['token'],
          amountIn: parsed.args['amountIn'],
          amountOut: parsed.args['amountOut']
        };
      } else if (parsed.name === 'CurveCreate') {
        return {
          name: 'CurveCreate',
          creator: parsed.args['creator'],
          token: parsed.args['token'],
          pool: parsed.args['pool'],
          tokenName: parsed.args['name'],
          symbol: parsed.args['symbol'],
          tokenURI: parsed.args['tokenURI'],
          virtualMon: parsed.args['virtualMon'],
          virtualToken: parsed.args['virtualToken'],
          targetTokenAmount: parsed.args['targetTokenAmount']
        };
      }

      return null;
    } catch (error) {
      // Fallback also failed
      return null;
    }
  }

  /**
   * Get event topic hashes (for filtering)
   */
  getEventTopics(): { CurveCreate: string; CurveBuy: string; CurveSell: string } | null {
    return EVENT_TOPICS;
  }
}

// Export singleton instance
export const binaryEventDecoder = new BinaryEventDecoder();
