/**
 * Curve Event Decoder Adapter
 * 
 * Infrastructure adapter for decoding bonding curve events.
 * Implements the IEventDecoderService interface.
 */

import { IEventDecoderService, RawBlockchainLog, DecodingResult } from '../../domain/services/event-decoder.service';
import { BlockchainEventData, EventPhase } from '../../domain/entities/blockchain-event.entity';
import { 
  CurveStateUpdateEvent, 
  CurveTradeEvent, 
  CurveTokenEvent, 
  CurvePairEvent 
} from '../../domain/entities/curve-events.entity';

export class CurveEventDecoderAdapter implements IEventDecoderService {
  private readonly eventSignatures = {
    STATE_UPDATE: '0xfd4bb47bd45abdbdb2ecd61052c9571773f9cde876e2a7745f488c20b30ab10a',
    TRADE_BUY: '0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862',
    TRADE_SELL: '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1',
    TOKEN_EVENT: '0xa9aaee0c81575bef307b11099af1a555ba16588e3b35cf930ee8c08f979b1a4a',
    PAIR_EVENT: '0xaa090437ef524cee1d4e0825c0caff2203af3b38ab39624d8ff7fab67e219704'
  };

  private readonly BUY_SIGNATURES = new Set([
    '0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862'
  ]);

  private readonly SELL_SIGNATURES = new Set([
    '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1'
  ]);

  async decode(log: RawBlockchainLog, phase: string): Promise<DecodingResult> {
    try {
      if (!this.canDecode(log)) {
        return {
          success: false,
          error: 'Unsupported event signature'
        };
      }

      const eventData = this.createEventData(log, phase);
      const topic0 = log.topics[0];

      switch (topic0) {
        case this.eventSignatures.STATE_UPDATE:
          return this.decodeStateUpdate(log, eventData);
          
        case this.eventSignatures.TRADE_BUY:
          return this.decodeTrade(log, eventData, 'BUY');
          
        case this.eventSignatures.TRADE_SELL:
          return this.decodeTrade(log, eventData, 'SELL');
          
        case this.eventSignatures.TOKEN_EVENT:
          return this.decodeTokenEvent(log, eventData);
          
        case this.eventSignatures.PAIR_EVENT:
          return this.decodePairEvent(log, eventData);
          
        default:
          return {
            success: false,
            error: `Unknown event signature: ${topic0}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  canDecode(log: RawBlockchainLog): boolean {
    const topic0 = log.topics[0];
    if (!topic0) return false;
    return Object.values(this.eventSignatures).includes(topic0);
  }

  getSupportedSignatures(): string[] {
    return Object.values(this.eventSignatures);
  }

  private createEventData(log: RawBlockchainLog, phase: string): BlockchainEventData {
    return {
      id: {
        transactionHash: log.transactionHash,
        logIndex: parseInt(log.logIndex, 16)
      },
      blockNumber: parseInt(log.blockNumber, 16),
      blockHash: log.blockHash,
      address: log.address,
      timestamp: new Date(),
      phase: this.parsePhase(phase)
    };
  }

  private parsePhase(phase: string): EventPhase {
    switch (phase.toLowerCase()) {
      case 'proposed': return EventPhase.PROPOSED;
      case 'voted': return EventPhase.VOTED;
      case 'finalized': return EventPhase.FINALIZED;
      case 'verified': return EventPhase.VERIFIED;
      default: return EventPhase.UNKNOWN;
    }
  }

  private decodeStateUpdate(log: RawBlockchainLog, eventData: BlockchainEventData): DecodingResult {
    try {
      if (!log.topics[1]) {
        return { success: false, error: 'Missing token topic in state update' };
      }
      
      const token = this.extractAddressFromTopic(log.topics[1]);
      if (!token || !log.data) {
        return { success: false, error: 'Invalid state update data' };
      }

      const reserves = this.parseReserves(log.data);
      
      const event = new CurveStateUpdateEvent(eventData, token, reserves);
      
      return { success: true, event };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to decode state update: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private decodeTrade(log: RawBlockchainLog, eventData: BlockchainEventData, tradeType?: string): DecodingResult {
    try {
      if (!log.topics[1] || !log.topics[2]) {
        return { success: false, error: 'Missing topics in trade event' };
      }
      
      const trader = this.extractAddressFromTopic(log.topics[1]);
      const token = this.extractAddressFromTopic(log.topics[2]);
      
      if (!trader || !token || !log.data) {
        return { success: false, error: 'Invalid trade data' };
      }

      const rawAmounts = this.parseTradeAmounts(log.data);
      
      // NAD.FUN directional mapping:
      // BUY: user sends WMON → amount1 = WMON, amount2 = TOKEN
      // SELL: user sends TOKEN → amount1 = TOKEN, amount2 = WMON
      const topic0 = log.topics[0];
      if (!topic0) {
        return { success: false, error: 'Missing event signature topic' };
      }
      
      const isBuy = this.isBuyFromSignature(topic0);
      
      const amounts = {
        amount1: rawAmounts.amount1,
        amount2: rawAmounts.amount2,
        // Directional mapping for easy access
        wmonAmount: isBuy ? rawAmounts.amount1 : rawAmounts.amount2,
        tokenAmount: isBuy ? rawAmounts.amount2 : rawAmounts.amount1,
        isBuy
      };
      
      const event = new CurveTradeEvent(eventData, trader, token, amounts, tradeType);
      
      return { success: true, event };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to decode trade: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private isBuyFromSignature(topic0: string): boolean {
    if (this.BUY_SIGNATURES.has(topic0)) return true;
    if (this.SELL_SIGNATURES.has(topic0)) return false;
    
    // Fallback - should not happen with proper signatures
    console.warn(`⚠️  Unknown trade signature: ${topic0}`);
    return true; // Default to buy
  }

  private decodeTokenEvent(log: RawBlockchainLog, eventData: BlockchainEventData): DecodingResult {
    try {
      if (!log.topics[1]) {
        return { success: false, error: 'Missing token topic in token event' };
      }
      
      const token = this.extractAddressFromTopic(log.topics[1]);
      
      if (!token) {
        return { success: false, error: 'Invalid token event data' };
      }
      
      // Extract creator from topics[2] if available (nad.fun token creation events)
      let creator = 'unknown';
      if (log.topics[2]) {
        const extractedCreator = this.extractAddressFromTopic(log.topics[2]);
        if (extractedCreator) {
          creator = extractedCreator;
        }
      }
      
      // Create enhanced token event with creator info
      const event = new CurveTokenEvent(eventData, token);
      // Add creator to event data for processing
      (event as any).creator = creator;
      
      return { success: true, event };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to decode token event: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private decodePairEvent(log: RawBlockchainLog, eventData: BlockchainEventData): DecodingResult {
    try {
      if (!log.topics[1] || !log.topics[2]) {
        return { success: false, error: 'Missing topics in pair event' };
      }
      
      const token = this.extractAddressFromTopic(log.topics[1]);
      const pool = this.extractAddressFromTopic(log.topics[2]);
      
      if (!token || !pool) {
        return { success: false, error: 'Invalid pair event data' };
      }
      
      const event = new CurvePairEvent(eventData, token, pool);
      
      return { success: true, event };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to decode pair event: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  private extractAddressFromTopic(topic: string): string | null {
    if (!topic || topic.length < 66) return null;
    
    // Remove padding and add 0x prefix
    const rawAddress = '0x' + topic.slice(26);
    
    // Convert to proper checksum format for nad.fun API compatibility
    // Blockchain provides lowercase, but nad.fun needs proper mixed case
    try {
      const { ethers } = require('ethers');
      return ethers.getAddress(rawAddress);
    } catch {
      // Fallback to raw address if checksum conversion fails
      return rawAddress;
    }
  }

  private parseReserves(data: string): {
    reserve1: bigint;
    reserve2: bigint;
    reserve3: bigint;
    reserve4: bigint;
  } {
    const cleanData = data.slice(2); // Remove 0x
    
    return {
      reserve1: BigInt('0x' + cleanData.slice(0, 64)),
      reserve2: BigInt('0x' + cleanData.slice(64, 128)),
      reserve3: BigInt('0x' + cleanData.slice(128, 192)),
      reserve4: BigInt('0x' + cleanData.slice(192, 256))
    };
  }

  private parseTradeAmounts(data: string): {
    amount1: bigint;
    amount2: bigint;
  } {
    const cleanData = data.slice(2); // Remove 0x
    
    // Debug: log the full data to see what we're getting
    console.log('[🔍 RAW EVENT DATA]', {
      fullData: data,
      dataLength: cleanData.length,
      expectedFields: cleanData.length / 64,
      amount1Hex: cleanData.slice(0, 64),
      amount2Hex: cleanData.slice(64, 128),
      amount3Hex: cleanData.length > 128 ? cleanData.slice(128, 192) : 'none',
      amount4Hex: cleanData.length > 192 ? cleanData.slice(192, 256) : 'none'
    });
    
    const amount1 = BigInt('0x' + cleanData.slice(0, 64));
    const amount2 = BigInt('0x' + cleanData.slice(64, 128));
    
    // Log the parsed amounts for debugging
    console.log('[🔍 PARSED AMOUNTS]', {
      amount1: amount1.toString(),
      amount2: amount2.toString(),
      amount1_18dec: (Number(amount1) / 1e18).toFixed(6),
      amount2_18dec: (Number(amount2) / 1e18).toFixed(6)
    });
    
    return {
      amount1,
      amount2
    };
  }
}