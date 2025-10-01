/**
 * NAD.FUN API Service
 * 
 * Handles all interactions with NAD.FUN's official API
 * for token metadata, statistics, and other data
 */

export interface NadFunTokenMetadata {
  token_address: string;
  name: string;
  symbol: string;
  image_uri: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  is_listing: boolean;
  created_at: number;
  transaction_hash: string;
  creator: string;
  total_supply: string;
}

export interface NadFunApiResponse<T> {
  token_metadata?: T;
  error?: string;
  message?: string;
}

export class NadFunApiService {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    baseUrl: string = 'https://testnet-v3-api.nad.fun',
    timeout: number = 5000
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Get complete token metadata from NAD.FUN API
   */
  async getTokenMetadata(tokenAddress: string): Promise<NadFunTokenMetadata | null> {
    try {
      const url = `${this.baseUrl}/token/metadata/${tokenAddress}`;
      
      console.log(`🔍 NAD.FUN API: Fetching metadata for ${tokenAddress}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MonadTracker/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`⚠️  NAD.FUN API: Token ${tokenAddress} not found (404)`);
          return null;
        }
        
        console.warn(`⚠️  NAD.FUN API: HTTP ${response.status} for ${tokenAddress}`);
        return null;
      }

      const data = await response.json() as NadFunApiResponse<NadFunTokenMetadata>;
      
      if (!data.token_metadata) {
        console.warn(`⚠️  NAD.FUN API: No token_metadata in response for ${tokenAddress}`);
        return null;
      }

      const metadata = data.token_metadata;
      
      console.log(`✅ NAD.FUN API: Retrieved metadata for ${metadata.name} (${metadata.symbol})`);
      
      // Validate required fields
      if (!metadata.token_address || !metadata.name || !metadata.symbol) {
        console.warn(`⚠️  NAD.FUN API: Invalid metadata structure for ${tokenAddress}`);
        return null;
      }

      return metadata;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn(`⚠️  NAD.FUN API: Timeout fetching metadata for ${tokenAddress}`);
      } else {
        console.error(`❌ NAD.FUN API: Error fetching metadata for ${tokenAddress}:`, error);
      }
      return null;
    }
  }

  /**
   * Get multiple token metadata in batch (if API supports it)
   */
  async getMultipleTokenMetadata(tokenAddresses: string[]): Promise<Map<string, NadFunTokenMetadata>> {
    const results = new Map<string, NadFunTokenMetadata>();
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    const batches = [];
    
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      batches.push(tokenAddresses.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const promises = batch.map(async (address) => {
        const metadata = await this.getTokenMetadata(address);
        if (metadata) {
          results.set(address.toLowerCase(), metadata);
        }
      });

      await Promise.all(promises);
      
      // Small delay between batches to be respectful to the API
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Check if token exists in NAD.FUN system
   */
  async tokenExists(tokenAddress: string): Promise<boolean> {
    const metadata = await this.getTokenMetadata(tokenAddress);
    return metadata !== null;
  }

  /**
   * Get token creation timestamp from API
   */
  async getTokenCreationTime(tokenAddress: string): Promise<Date | null> {
    const metadata = await this.getTokenMetadata(tokenAddress);
    
    if (!metadata || !metadata.created_at) {
      return null;
    }

    // Convert Unix timestamp to Date
    return new Date(metadata.created_at * 1000);
  }

  /**
   * Get token creator from API
   */
  async getTokenCreator(tokenAddress: string): Promise<string | null> {
    const metadata = await this.getTokenMetadata(tokenAddress);
    return metadata?.creator || null;
  }

  /**
   * Get token social links
   */
  async getTokenSocials(tokenAddress: string): Promise<{
    website?: string;
    twitter?: string;
    telegram?: string;
  } | null> {
    const metadata = await this.getTokenMetadata(tokenAddress);
    
    if (!metadata) return null;

    return {
      website: metadata.website || undefined,
      twitter: metadata.twitter || undefined,
      telegram: metadata.telegram || undefined
    };
  }

  /**
   * Validate API connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      // Try to fetch a known token or make a simple API call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      console.error('❌ NAD.FUN API: Connection validation failed:', error);
      return false;
    }
  }

  /**
   * Get API statistics
   */
  getStats(): {
    baseUrl: string;
    timeout: number;
    isHealthy: boolean;
  } {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      isHealthy: true // Would track actual health
    };
  }
}

// Singleton instance for global use
export const nadFunApi = new NadFunApiService();

// Usage examples:
/*
// Get single token metadata
const metadata = await nadFunApi.getTokenMetadata('0x082fF39711f2DD8354a51c45FE405ceB51e181E0');
console.log(metadata?.name, metadata?.symbol);

// Get multiple tokens
const tokens = ['0x...', '0x...'];
const metadataMap = await nadFunApi.getMultipleTokenMetadata(tokens);

// Check if token exists
const exists = await nadFunApi.tokenExists('0x...');

// Get just the creator
const creator = await nadFunApi.getTokenCreator('0x...');
*/