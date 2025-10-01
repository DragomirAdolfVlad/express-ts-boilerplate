/**
 * DEX Event Decoder Adapter
 * 
 * Infrastructure adapter for decoding DEX swap events.
 * Implements the IEventDecoderService interface.
 */

import { decodeEventLog } from 'viem';
import { IEventDecoderService, RawBlockchainLog, DecodingResult } from '../../domain/services/event-decoder.service';
import { BlockchainEventData, EventPhase } from '../../domain/entities/blockchain-event.entity';
import { DexSwapEvent } from '../../domain/entities/dex-events.entity';
import { UNISWAP_V3_POOL_ABI } from './abis/official-nad-fun.abi';

export class DexEventDecoderAdapter implements IEventDecoderService {
  async decode(log: RawBlockchainLog, phase: string): Promise<DecodingResult> {
    try {
      if (!this.canDecode(log)) {
        return {
          success: false,
          error: 'Unsupported DEX event'
        };
      }

      const eventData = this.createEventData(log, phase);
      return this.decodeSwapEvent(log, eventData);
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  canDecode(log: RawBlockchainLog): boolean {
    try {
      // Try to decode with Uniswap V3 ABI
      decodeEventLog({
        abi: UNISWAP_V3_POOL_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...Array<`0x${string}`>]
      });
      return true;
    } catch {
      return false;
    }
  }

  getSupportedSignatures(): string[] {
    // Uniswap V3 Swap event signature
    return ['0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'];
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

  private decodeSwapEvent(log: RawBlockchainLog, eventData: BlockchainEventData): DecodingResult {
    try {
      const decoded = decodeEventLog({
        abi: UNISWAP_V3_POOL_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...Array<`0x${string}`>]
      });

      if (decoded.eventName === 'Swap') {
        const { sender, recipient, amount0, amount1, tick } = decoded.args as any;
        
        const event = new DexSwapEvent(
          eventData,
          log.address, // pool address
          sender,
          recipient,
          { amount0, amount1 },
          tick
        );
        
        return { success: true, event };
      }

      return { success: false, error: 'Unknown DEX event type' };
      
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to decode DEX swap: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }
}