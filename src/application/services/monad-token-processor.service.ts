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
import { 
  weiToHuman, 
  calculatePrice, 
  logAmountComparison,
  validateReserves
} from '../../utils/bigint-scaling';

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
    private readonly wmonPriceProvider: WmonPriceProvider,
    private readonly provider?: any // Blockchain provider for getting block hashes
  ) { }

  /**
   * Process a curve token event (new token launch)
   */
  async processTokenLaunch(event: CurveTokenEvent): Promise<ProcessedTokenLaunch> {
    // Extract creator from event if available
    const creator = (event as any).creator || 'unknown';

    // Get real block data (hash and timestamp)
    const blockData = await this.getBlockData(event.blockNumber);
    
    const tokenData: MonadTokenData = {
      address: event.tokenAddress,
      creator: creator, // Use extracted creator from blockchain event
      bondingCurve: event.address, // The contract that emitted the event
      blockNumber: event.blockNumber.toString(),
      blockId: blockData.hash, // Real block hash
      commitState: event.phase as any,
      timestamp: blockData.timestamp // Real block timestamp
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
    // Determine trade direction using multiple methods for reliability
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

    // NAD.FUN DIRECTIONAL MAPPING - Both WMON and tokens use 18 decimals
    // BUY: user sends WMON → amount1 = WMON, amount2 = TOKEN  
    // SELL: user sends TOKEN → amount1 = TOKEN, amount2 = WMON
    
    // Store raw amounts for debugging
    const rawAmount1 = tradeEvent.tradeAmounts.amount1;
    const rawAmount2 = tradeEvent.tradeAmounts.amount2;
    
    const wmonAmountWei = tradeEvent.tradeAmounts.wmonAmount || 
      (isBuy ? tradeEvent.tradeAmounts.amount1 : tradeEvent.tradeAmounts.amount2);
    const tokenAmountWei = tradeEvent.tradeAmounts.tokenAmount || 
      (isBuy ? tradeEvent.tradeAmounts.amount2 : tradeEvent.tradeAmounts.amount1);
    
    // Log directional amounts for verification
    logAmountComparison(
      'DIRECTIONAL_MAPPING', 
      wmonAmountWei, 
      tokenAmountWei, 
      `${isBuy ? 'BUY' : 'SELL'} ${tradeEvent.tokenAddress.slice(0, 8)}...`
    );

    // Calculate price per token using proper BigInt scaling
    const pricePerTokenHuman = calculatePrice(wmonAmountWei, tokenAmountWei);
    const pricePerToken = BigInt(Math.floor(pricePerTokenHuman * 1e18)); // Store as wei-like units

    // Convert to human readable amounts
    const wmonAmount = weiToHuman(wmonAmountWei, 18);
    const tokenAmount = weiToHuman(tokenAmountWei, 18);
    const usdValue = wmonAmount * wmonPriceUsd;

    // Sanity checks and logging
    console.log('[PROCESSED_TRADE]', {
      type: isBuy ? 'BUY' : 'SELL',
      token: tradeEvent.tokenAddress.slice(0, 8) + '...',
      wmonHuman: wmonAmount.toFixed(6),
      tokenHuman: tokenAmount.toFixed(0),
      priceHuman: pricePerTokenHuman.toFixed(12),
      usdValue: usdValue.toFixed(2),
      eventType: tradeEvent.eventType || 'unknown'
    });
    
    // Detect suspicious prices (>50% change would be flagged if we had previous price)
    if (pricePerTokenHuman <= 0) {
      console.warn('⚠️  Zero or negative price detected');
    }
    
    if (pricePerTokenHuman > 0.001) {
      console.warn('⚠️  Unusually high token price:', pricePerTokenHuman);
    }

    console.log(`[💱 TRADE] ${isBuy ? 'BUY' : 'SELL'} ${tradeEvent.tokenAddress.slice(0, 8)}... - ${wmonAmount.toFixed(4)} WMON ($${usdValue.toFixed(2)} USD)`);

    // Get real block data (hash and timestamp)
    const blockData = await this.getBlockData(tradeEvent.blockNumber);

    const tradeData: MonadTradeData = {
      tokenAddress: tradeEvent.tokenAddress,
      trader: tradeEvent.traderAddress,
      isBuy,
      wmonAmount: wmonAmountWei,
      tokenAmount: tokenAmountWei,
      pricePerToken,
      usdAmount: usdValue,
      // Store raw amounts for verification and debugging
      amountWmonRaw: rawAmount1, // Original amount1 from blockchain
      amountTokenRaw: rawAmount2, // Original amount2 from blockchain
      reserves: stateEvent ? {
        reserve1: stateEvent.tokenReserves.reserve1,
        reserve2: stateEvent.tokenReserves.reserve2,
        reserve3: stateEvent.tokenReserves.reserve3,
        reserve4: stateEvent.tokenReserves.reserve4,
      } : {
        // NAD.FUN typical virtual reserves (realistic values)
        reserve1: BigInt(0), // Real WMON reserve (will be updated by state events)
        reserve2: BigInt(0), // Real token reserve (will be updated by state events)
        reserve3: BigInt(30000) * BigInt(10**18), // Virtual WMON reserve: 30K WMON
        reserve4: BigInt(1000000000) * BigInt(10**18), // Virtual token reserve: 1B tokens
      },
      blockNumber: tradeEvent.blockNumber.toString(),
      blockId: blockData.hash,
      commitState: tradeEvent.phase,
      timestamp: blockData.timestamp,
      transactionHash: tradeEvent.id.transactionHash,
      logIndex: tradeEvent.id.logIndex,
      eventSignature: this.getEventSignature(tradeEvent)
    };

    // Validate reserves before creating trade
    const reserveIssues = validateReserves(tradeData.reserves);
    if (reserveIssues.length > 0) {
      console.warn('⚠️  Reserve validation issues:', reserveIssues);
    }

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
    // Get real block data (hash and timestamp)
    const blockData = await this.getBlockData(event.blockNumber);
    
    const tokenData: MonadTokenData = {
      address: event.tokenAddress,
      creator: 'unknown',
      bondingCurve: event.address,
      blockNumber: event.blockNumber.toString(),
      blockId: blockData.hash,
      commitState: event.phase as any,
      timestamp: blockData.timestamp // Real block timestamp
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
   * Determine if trade is buy or sell from event signature
   */
  private determineTradDirection(tradeEvent: CurveTradeEvent): boolean {
    // Primary method: Use event signature to determine direction
    const eventType = tradeEvent.eventType;
    
    if (eventType === 'BUY') {
      return true;
    } else if (eventType === 'SELL') {
      return false;
    }
    
    // Fallback: Check if directional amounts are available
    if (tradeEvent.tradeAmounts.isBuy !== undefined) {
      return tradeEvent.tradeAmounts.isBuy;
    }
    
    // Last resort: Log warning and default to BUY
    console.warn(`⚠️  Could not determine trade direction for event type: ${eventType}`);
    return true;
  }

  private getEventSignature(tradeEvent: CurveTradeEvent): string | undefined {
    const eventType = tradeEvent.eventType;
    if (eventType === 'BUY') {
      return '0x00a7ba871905cb955432583640b5c9fc6bdd27d36884ab2b5420839224638862';
    } else if (eventType === 'SELL') {
      return '0x0eb25df0e2137de8ce042eeaf39080d25f0c8d451372c99db69a4c0a298d0fa1';
    }
    return undefined;
  }

  // calculatePricePerToken method removed - now calculated inline with corrected field mapping

  /**
   * Get block data (hash and timestamp) for a given block number
   */
  private async getBlockData(blockNumber: number): Promise<{ hash: string; timestamp: Date }> {
    try {
      if (!this.provider) {
        console.warn('⚠️  No provider available, using fallback values');
        return {
          hash: blockNumber.toString(),
          timestamp: new Date() // Fallback to current time
        };
      }

      const block = await this.provider.getBlock(blockNumber);
      if (block && block.hash) {
        return {
          hash: block.hash,
          timestamp: new Date(block.timestamp * 1000) // Convert to milliseconds
        };
      } else {
        console.warn(`⚠️  Could not get block data for block ${blockNumber}`);
        return {
          hash: blockNumber.toString(),
          timestamp: new Date()
        };
      }
    } catch (error) {
      console.warn(`⚠️  Error getting block data for block ${blockNumber}:`, error);
      return {
        hash: blockNumber.toString(),
        timestamp: new Date()
      };
    }
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