/**
 * WMON Price Background Service
 * 
 * Production-grade background service that:
 * - Fetches WMON price from Pyth Network every 5 minutes
 * - Maintains cached price for instant access
 * - Provides price for all calculations and conversions
 * - Handles errors gracefully with fallback pricing
 */

export interface WmonPriceData {
    price: number;
    confidence: number;
    timestamp: Date;
    source: 'pyth' | 'fallback';
}

export class WmonPriceBackgroundService {
    private currentPrice: WmonPriceData;
    private updateInterval: NodeJS.Timeout | null = null;
    private readonly UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private readonly FALLBACK_PRICE = 3.25; // Default WMON price
    
    private readonly pythUrl: string;
    private readonly priceId: string;

    constructor() {
        this.pythUrl = process.env['PYTH_HERMES_URL'] || 'https://hermes-beta.pyth.network/v2/updates/price/latest';
        this.priceId = process.env['PYTH_PRICE_ID'] || '0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b';
        
        // Initialize with fallback price
        this.currentPrice = {
            price: this.FALLBACK_PRICE,
            confidence: this.FALLBACK_PRICE * 0.1, // 10% confidence interval
            timestamp: new Date(),
            source: 'fallback'
        };
    }

    /**
     * Start the background price fetching service
     */
    async start(): Promise<void> {
        console.log('[💰 PRICE SERVICE] Starting WMON price background service...');
        
        // Fetch initial price immediately
        await this.fetchAndUpdatePrice();
        
        // Set up recurring updates every 5 minutes
        this.updateInterval = setInterval(async () => {
            await this.fetchAndUpdatePrice();
        }, this.UPDATE_INTERVAL);
        
        console.log('[💰 PRICE SERVICE] Background service started - updating every 5 minutes');
    }

    /**
     * Stop the background service
     */
    stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[💰 PRICE SERVICE] Background service stopped');
        }
    }

    /**
     * Get current WMON price (instant access from cache)
     */
    getCurrentPrice(): number {
        return this.currentPrice.price;
    }

    /**
     * Get current WMON price with full data
     */
    getCurrentPriceData(): WmonPriceData {
        return { ...this.currentPrice };
    }

    /**
     * Convert WMON amount to USD
     */
    wmonToUsd(wmonAmount: number | bigint): number {
        const amount = typeof wmonAmount === 'bigint' ? Number(wmonAmount) / 1e18 : wmonAmount;
        return amount * this.currentPrice.price;
    }

    /**
     * Convert USD amount to WMON
     */
    usdToWmon(usdAmount: number): number {
        return usdAmount / this.currentPrice.price;
    }

    /**
     * Get price age in minutes
     */
    getPriceAge(): number {
        return (Date.now() - this.currentPrice.timestamp.getTime()) / (1000 * 60);
    }

    /**
     * Check if price is stale (older than 10 minutes)
     */
    isPriceStale(): boolean {
        return this.getPriceAge() > 10;
    }

    /**
     * Fetch and update price from Pyth Network
     */
    private async fetchAndUpdatePrice(): Promise<void> {
        try {
            console.log('[💰 PRICE SERVICE] Fetching WMON price from Pyth Network...');
            
            const url = `${this.pythUrl}?ids[]=${this.priceId}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Monad-Token-Tracker/1.0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Pyth API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json() as any;
            
            if (data.parsed && Array.isArray(data.parsed) && data.parsed.length > 0) {
                const priceData = data.parsed[0];
                
                if (priceData.price && typeof priceData.price.price === 'string') {
                    const price = parseInt(priceData.price.price);
                    const expo = priceData.price.expo;
                    const conf = parseInt(priceData.price.conf || '0');
                    const publishTime = parseInt(priceData.price.publish_time);
                    
                    // Calculate actual price: price * 10^expo
                    const actualPrice = price * Math.pow(10, expo);
                    const confidence = conf * Math.pow(10, expo);
                    
                    // Sanity check - WMON price should be reasonable
                    if (actualPrice > 0 && actualPrice < 1000) {
                        this.currentPrice = {
                            price: actualPrice,
                            confidence: confidence,
                            timestamp: new Date(publishTime * 1000),
                            source: 'pyth'
                        };
                        
                        const confidencePercent = (confidence / actualPrice * 100).toFixed(2);
                        console.log(`[✅ PRICE SERVICE] WMON price updated: $${actualPrice.toFixed(6)} (±${confidencePercent}%)`);
                        return;
                    } else {
                        throw new Error(`Unreasonable WMON price: ${actualPrice}`);
                    }
                }
            }
            
            throw new Error('Invalid Pyth response format');
            
        } catch (error) {
            console.warn(`[⚠️ PRICE SERVICE] Failed to fetch price from Pyth:`, error);
            
            // Keep using cached price if it's not too old, otherwise use fallback
            if (this.isPriceStale()) {
                console.warn(`[⚠️ PRICE SERVICE] Price is stale, using fallback: $${this.FALLBACK_PRICE}`);
                this.currentPrice = {
                    price: this.FALLBACK_PRICE,
                    confidence: this.FALLBACK_PRICE * 0.1,
                    timestamp: new Date(),
                    source: 'fallback'
                };
            } else {
                console.log(`[💾 PRICE SERVICE] Using cached price: $${this.currentPrice.price.toFixed(6)} (${this.getPriceAge().toFixed(1)} min old)`);
            }
        }
    }

    /**
     * Force refresh price (useful for testing or manual updates)
     */
    async forceRefresh(): Promise<void> {
        await this.fetchAndUpdatePrice();
    }

    /**
     * Get service status for monitoring
     */
    getStatus(): {
        isRunning: boolean;
        currentPrice: number;
        priceAge: number;
        source: string;
        isStale: boolean;
    } {
        return {
            isRunning: this.updateInterval !== null,
            currentPrice: this.currentPrice.price,
            priceAge: this.getPriceAge(),
            source: this.currentPrice.source,
            isStale: this.isPriceStale()
        };
    }
}