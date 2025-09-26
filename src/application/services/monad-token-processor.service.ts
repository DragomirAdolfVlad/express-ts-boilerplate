/**
 * Monad Token Processor Service
 * 
 * Processes Monad blockchain events and converts them to database-ready format.
 * Focuses on finalized transactions for confirmed data.
 */

import { MonadToken, MonadTrade, MonadTokenData, MonadTradeData } from '../../domain/entities/monad-token.entity';
import { 
  CurveStateUpdateEvent, 
  CurveTradeEvent, 
  CurveTokenEvent, 
  CurvePairEvent 
} from '../../domain/entities/curve-events.entity';

export interface ProcessedTokenLaunch {
  token: MonadToken;
  shouldPersist: boolean;
  reason: string;
}

export interface ProcessedTrade {
  trade: MonadTrade;
  shouldPersist: boolean;
  reason: string;
}

export interface WmonPriceProvider {
  getCurrentPrice(): Promise<number>;
}

export class MonadTokenProcessorService {
  constructor(
    private readonly wmonPriceProvider: WmonPriceProvider
  ) {}

  /**
   * Process a curve token event (new token launch)
   */
  async processTokenLaunch(event: CurveTokenEvent): Promise<ProcessedTokenLaunch> {
    // Extract creator from event if available
    const creator = (event as any).creator || 'unknown';
    
    const tokenData: MonadTokenData = {
      address: event.tokenAddress,
      creator: creator, // Use extracted creator from blockchain event
      bondingCurve: event.address, // The contract that emitted the event
      blockNumber: event.blockNumber.toString(),
      blockId: 'unknown', // Will be set by the adapter
      commitState: event.phase as any,
      timestamp: event.timestamp
    };

    const token = new MonadToken(tokenData);

    // Only persist finalized token launches for confirmed data
    const shouldPersist = token.isFinalized;
    const reason = shouldPersist 
      ? 'Token launch confirmed (finalized)'
      : `Token launch pending (${event.phase})`;

    return {
      token,
      shouldPersist,
      reason
    };
  }

  /**
   * Process a curve trade event
   */
  async processTrade(
    tradeEvent: CurveTradeEvent, 
    stateEvent?: CurveStateUpdateEvent
  ): Promise<ProcessedTrade> {
    // Determine if this is a buy or sell based on amounts
    const isBuy = this.determineTradDirection(tradeEvent);
    
    // Get current WMON price for USD calculations
    const wmonPriceUsd = await this.wmonPriceProvider.getCurrentPrice();
    
    // Calculate price per token
    const pricePerToken = this.calculatePricePerToken(
      tradeEvent.tradeAmounts.amount1,
      tradeEvent.tradeAmounts.amount2,
      isBuy
    );

    // Log the trade with USD value
    const usdValue = (Number(tradeEvent.tradeAmounts.amount2) / 1e18) * wmonPriceUsd;
    console.log(`[💱 TRADE] ${isBuy ? 'BUY' : 'SELL'} ${tradeEvent.tokenAddress.slice(0, 8)}... - $${usdValue.toFixed(2)} USD`);

    const tradeData: MonadTradeData = {
      tokenAddress: tradeEvent.tokenAddress,
      trader: tradeEvent.traderAddress,
      isBuy,
      wmonAmount: tradeEvent.tradeAmounts.amount2, // Assuming amount2 is WMON
      tokenAmount: tradeEvent.tradeAmounts.amount1, // Assuming amount1 is token
      pricePerToken,
      reserves: stateEvent ? {
        reserve1: stateEvent.tokenReserves.reserve1,
        reserve2: stateEvent.tokenReserves.reserve2,
        reserve3: stateEvent.tokenReserves.reserve3,
        reserve4: stateEvent.tokenReserves.reserve4
      } : {
        reserve1: 0n,
        reserve2: 0n,
        reserve3: 0n,
        reserve4: 0n
      },
      blockNumber: tradeEvent.blockNumber.toString(),
      blockId: 'unknown', // Will be set by the adapter
      commitState: tradeEvent.phase,
      timestamp: tradeEvent.timestamp,
      transactionHash: tradeEvent.id.transactionHash
    };

    const trade = new MonadTrade(tradeData);

    // Only persist finalized trades for confirmed transactions
    const shouldPersist = trade.isFinalized;
    const reason = shouldPersist 
      ? 'Trade confirmed (finalized)'
      : `Trade pending (${tradeEvent.phase})`;

    return {
      trade,
      shouldPersist,
      reason
    };
  }

  /**
   * Process a curve pair event (token graduation to DEX)
   */
  async processPairEvent(event: CurvePairEvent): Promise<ProcessedTokenLaunch> {
    const tokenData: MonadTokenData = {
      address: event.tokenAddress,
      creator: 'unknown',
      bondingCurve: event.address,
      blockNumber: event.blockNumber.toString(),
      blockId: 'unknown',
      commitState: event.phase as any,
      timestamp: event.timestamp
    };

    const token = new MonadToken(tokenData);

    // Pair events are important - they indicate DEX graduation
    const shouldPersist = token.isFinalized;
    const reason = shouldPersist 
      ? 'Token graduated to DEX (finalized)'
      : `Token graduation pending (${event.phase})`;

    return {
      token,
      shouldPersist,
      reason
    };
  }

  /**
   * Convert processed data to pump.fun compatible format
   */
  async convertToPumpFunFormat(trade: MonadTrade): Promise<any> {
    const wmonPriceUsd = await this.wmonPriceProvider.getCurrentPrice();
    return trade.toPumpFunFormat(wmonPriceUsd);
  }

  /**
   * Determine if trade is buy or sell based on amounts
   */
  private determineTradDirection(tradeEvent: CurveTradeEvent): boolean {
    // This logic depends on the specific bonding curve implementation
    // For now, assume amount1 > 0 means buying tokens with WMON
    return tradeEvent.tradeAmounts.amount1 > 0n;
  }

  /**
   * Calculate price per token from trade amounts
   */
  private calculatePricePerToken(tokenAmount: bigint, wmonAmount: bigint, _isBuy: boolean): bigint {
    if (tokenAmount === 0n) return 0n;
    
    // Price per token = WMON amount / token amount
    return (wmonAmount * BigInt(1e18)) / tokenAmount;
  }

  /**
   * Check if we should process this event based on commit state
   */
  shouldProcessEvent(commitState: string, requireFinalized: boolean = true): boolean {
    if (!requireFinalized) return true;
    
    return commitState === 'finalized' || commitState === 'verified';
  }

  /**
   * Get current WMON price with confidence data
   */
  async getWmonPriceInfo(): Promise<{ price: number; confidence: number; timestamp: Date }> {
    // Check if the price provider supports confidence data
    if ('getPriceWithConfidence' in this.wmonPriceProvider) {
      return (this.wmonPriceProvider as any).getPriceWithConfidence();
    } else {
      const price = await this.wmonPriceProvider.getCurrentPrice();
      return {
        price,
        confidence: price * 0.05, // 5% estimated confidence
        timestamp: new Date()
      };
    }
  }

  /**
   * Calculate trading statistics for a token
   */
  calculateTradingStats(trades: MonadTrade[]): {
    totalVolume: number;
    buyVolume: number;
    sellVolume: number;
    buyCount: number;
    sellCount: number;
    lastTradeTime: Date;
  } {
    let totalVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let buyCount = 0;
    let sellCount = 0;
    let lastTradeTime = new Date(0);

    for (const trade of trades) {
      const volumeWmon = Number(trade.wmonAmount) / 1e18;
      
      totalVolume += volumeWmon;
      
      if (trade.isBuy) {
        buyVolume += volumeWmon;
        buyCount++;
      } else {
        sellVolume += volumeWmon;
        sellCount++;
      }
      
      if (trade.timestamp > lastTradeTime) {
        lastTradeTime = trade.timestamp;
      }
    }

    return {
      totalVolume,
      buyVolume,
      sellVolume,
      buyCount,
      sellCount,
      lastTradeTime
    };
  }
}