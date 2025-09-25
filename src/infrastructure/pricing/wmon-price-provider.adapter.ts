/**
 * WMON Price Provider Adapter
 * 
 * Provides current WMON/USD price for calculations.
 * Can be extended to use real price feeds in the future.
 */

import { WmonPriceProvider } from '../../application/services/monad-token-processor.service';

export class WmonPriceProviderAdapter implements WmonPriceProvider {
  private pythProvider: PythWmonPriceProvider;
  private fallbackPrice: number = 0.05; // Default fallback price

  constructor() {
    // Use Pyth Network as primary price source
    this.pythProvider = new PythWmonPriceProvider();
  }

  async getCurrentPrice(): Promise<number> {
    try {
      // Try Pyth first
      const price = await this.pythProvider.getCurrentPrice();
      return price;
    } catch (error) {
      console.warn('[⚠️ PRICE FALLBACK] Pyth failed, using fallback price:', this.fallbackPrice);
      return this.fallbackPrice;
    }
  }

  /**
   * Get price with confidence data from Pyth
   */
  async getPriceWithConfidence(): Promise<{ price: number; confidence: number; timestamp: Date }> {
    return this.pythProvider.getPriceWithConfidence();
  }

  /**
   * Set a manual fallback price (useful for testing)
   */
  setFallbackPrice(price: number): void {
    this.fallbackPrice = price;
  }

  /**
   * Get the underlying Pyth provider for advanced usage
   */
  getPythProvider(): PythWmonPriceProvider {
    return this.pythProvider;
  }
}

// Alternative implementation using Pyth Network
export class PythWmonPriceProvider implements WmonPriceProvider {
  private cachedPrice: number = 0.05;
  private lastUpdate: Date = new Date(0);
  private readonly cacheTimeout = 30000; // 30 seconds cache for Pyth

  constructor(
    private readonly pythHermesUrl: string = process.env['PYTH_HERMES_URL'] || 'https://hermes-beta.pyth.network/v2/updates/price/latest',
    private readonly priceId: string = process.env['PYTH_PRICE_ID'] || '0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b'
  ) {}

  async getCurrentPrice(): Promise<number> {
    // Check cache first
    if (Date.now() - this.lastUpdate.getTime() < this.cacheTimeout) {
      return this.cachedPrice;
    }

    try {
      const price = await this.fetchFromPyth();
      
      this.cachedPrice = price;
      this.lastUpdate = new Date();
      
      console.log(`[💰 WMON PRICE] Updated: $${price.toFixed(6)} (via Pyth Network)`);
      
      return price;
    } catch (error) {
      console.warn('[⚠️ PYTH ERROR] Failed to fetch WMON price, using cached:', this.cachedPrice, error);
      return this.cachedPrice;
    }
  }

  private async fetchFromPyth(): Promise<number> {
    // Pyth Hermes API endpoint for latest price
    const url = `${this.pythHermesUrl}?ids[]=${this.priceId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Add timeout
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    
    // Parse Pyth Hermes response format
    if (data.parsed && Array.isArray(data.parsed) && data.parsed.length > 0) {
      const priceData = data.parsed[0];
      
      if (priceData.price && typeof priceData.price.price === 'string') {
        const price = parseInt(priceData.price.price);
        const expo = priceData.price.expo;
        const conf = parseInt(priceData.price.conf || '0');
        
        // Calculate actual price: price * 10^expo
        const actualPrice = price * Math.pow(10, expo);
        
        // Confidence check - if confidence interval is too wide, use fallback
        const confidence = conf * Math.pow(10, expo);
        const confidenceRatio = confidence / actualPrice;
        
        if (confidenceRatio > 0.1) { // If confidence is more than 10% of price
          console.warn(`[⚠️ PYTH] Low confidence price: ${actualPrice} ±${confidence} (${(confidenceRatio * 100).toFixed(1)}%)`);
        }
        
        // Sanity check - WMON price should be reasonable
        if (actualPrice > 0 && actualPrice < 1000) {
          return actualPrice;
        } else {
          throw new Error(`Unreasonable WMON price: ${actualPrice}`);
        }
      }
    }
    
    throw new Error('Invalid Pyth response format');
  }

  /**
   * Get price with confidence interval
   */
  async getPriceWithConfidence(): Promise<{ price: number; confidence: number; timestamp: Date }> {
    try {
      const url = `${this.pythHermesUrl}?ids[]=${this.priceId}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await response.json() as any;
      
      if (data.parsed && data.parsed.length > 0) {
        const priceData = data.parsed[0];
        const price = parseInt(priceData.price.price);
        const expo = priceData.price.expo;
        const conf = parseInt(priceData.price.conf || '0');
        const publishTime = parseInt(priceData.price.publish_time);
        
        return {
          price: price * Math.pow(10, expo),
          confidence: conf * Math.pow(10, expo),
          timestamp: new Date(publishTime * 1000)
        };
      }
      
      throw new Error('No price data');
    } catch (error) {
      return {
        price: this.cachedPrice,
        confidence: this.cachedPrice * 0.05, // 5% confidence fallback
        timestamp: this.lastUpdate
      };
    }
  }
}