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
  ) { }

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

    // Get current WMON price for USD calculations (with fallback)
    let wmonPriceUsd: number;
    try {
      wmonPriceUsd = await this.wmonPriceProvider.getCurrentPrice();
    } catch (error) {
      console.warn('[⚠️ PRICE] WMON price unavailable, using fallback of $3.26');
      wmonPriceUsd = 3.26; // Fallback price for USD calculations
    }

    // Calculate price per token (old method - will be replaced)

    // Sanity logs - check raw amounts first
    console.log('[RAW EVENT]', {
      a1_type: typeof tradeEvent.tradeAmounts.amount1,
      a2_type: typeof tradeEvent.tradeAmounts.amount2,
      amount1_str: tradeEvent.tradeAmounts.amount1.toString(), // expect ~1e17–1e19 for small WMON
      amount2_str: tradeEvent.tradeAmounts.amount2.toString(), // expect huge token units
    });

    // CORRECTED FIELD MAPPING
    const tokenAmountWei = tradeEvent.tradeAmounts.amount2; // TOKEN (wei/base units)
    const wmonAmountWei = tradeEvent.tradeAmounts.amount1;  // WMON (wei)

    // price per token in WMON (scaled to 1e18)
    const pricePerToken = tokenAmountWei === 0n
      ? 0n
      : (wmonAmountWei * 10n ** 18n) / tokenAmountWei;

    // USD value from WMON only
    const wmonAmount = Number(wmonAmountWei) / 1e18;   // 18 decimals
    const usdValue = wmonAmount * wmonPriceUsd;

    console.log('[PROC CHECK]', {
      wmonWei: wmonAmountWei.toString(),
      tokenWei: tokenAmountWei.toString(),
      wmon: wmonAmount,
      token: Number(tokenAmountWei) / 1e18,
      usdValue: usdValue
    });

    console.log(`[💱 TRADE] ${isBuy ? 'BUY' : 'SELL'} ${tradeEvent.tokenAddress.slice(0, 8)}... - ${wmonAmount.toFixed(4)} WMON ($${usdValue.toFixed(2)} USD)`);

    const tradeData: MonadTradeData = {
      tokenAddress: tradeEvent.tokenAddress,
      trader: tradeEvent.traderAddress,
      isBuy,
      wmonAmount: wmonAmountWei,   // ✅ raw WMON wei
      tokenAmount: tokenAmountWei, // ✅ raw TOKEN units
      pricePerToken,
      usdAmount: usdValue,
      reserves: stateEvent ? {
        // if your chain uses (realMon, realToken, virtualMon, virtualToken)
        reserve1: stateEvent.tokenReserves.reserve1, // realMon (WMON)
        reserve2: stateEvent.tokenReserves.reserve2, // realToken
        reserve3: stateEvent.tokenReserves.reserve3, // virtualMon
        reserve4: stateEvent.tokenReserves.reserve4, // virtualToken
      } : {
        reserve1: wmonAmountWei,
        reserve2: tokenAmountWei,
        reserve3: BigInt(432) * 10n ** 18n,
        reserve4: 1_000_000_000n * 10n ** 18n,
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

  // calculatePricePerToken method removed - now calculated inline with corrected field mapping

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