/**
 * WMON Price Provider Adapter
 * 
 * Production-grade price provider that uses background service for instant price access.
 * No more API calls during trade processing - prices are pre-fetched every 5 minutes.
 */

import { WmonPriceProvider } from '../../application/services/monad-token-processor.service';
import { WmonPriceBackgroundService, WmonPriceData } from '../../application/services/wmon-price-background.service';

export class WmonPriceProviderAdapter implements WmonPriceProvider {
  private backgroundService: WmonPriceBackgroundService;

  constructor(backgroundService?: WmonPriceBackgroundService) {
    // Use provided background service or create new one
    this.backgroundService = backgroundService || new WmonPriceBackgroundService();
  }

  /**
   * Get current WMON price (null if unavailable - NO FALLBACK PRICES)
   */
  async getCurrentPrice(): Promise<number> {
    const price = this.backgroundService.getCurrentPrice();
    if (price === null) {
      throw new Error('WMON price unavailable - system continues without USD calculations');
    }
    return price;
  }

  /**
   * Get price with confidence data (null values if unavailable)
   */
  async getPriceWithConfidence(): Promise<{ price: number; confidence: number; timestamp: Date }> {
    const priceData = this.backgroundService.getCurrentPriceData();
    if (priceData.price === null) {
      throw new Error('WMON price unavailable');
    }
    return {
      price: priceData.price,
      confidence: priceData.confidence!,
      timestamp: priceData.timestamp
    };
  }

  /**
   * Convert WMON amount to USD (null if price unavailable)
   */
  wmonToUsd(wmonAmount: number | bigint): number | null {
    return this.backgroundService.wmonToUsd(wmonAmount);
  }

  /**
   * Convert USD amount to WMON (null if price unavailable)
   */
  usdToWmon(usdAmount: number): number | null {
    return this.backgroundService.usdToWmon(usdAmount);
  }

  /**
   * Check if price is available
   */
  isPriceAvailable(): boolean {
    return this.backgroundService.getCurrentPrice() !== null;
  }

  /**
   * Get full price data with metadata
   */
  getCurrentPriceData(): WmonPriceData {
    return this.backgroundService.getCurrentPriceData();
  }

  /**
   * Get the background service for advanced usage
   */
  getBackgroundService(): WmonPriceBackgroundService {
    return this.backgroundService;
  }

  /**
   * Force refresh price (useful for testing)
   */
  async forceRefresh(): Promise<void> {
    await this.backgroundService.forceRefresh();
  }
}