/**
 * Token Metadata Service
 * 
 * Safe fetching of ERC-20 token metadata with proper error handling
 */

import { Contract } from 'ethers';
import { httpProvider, withRetry } from './providers';
import { validateNadFunToken } from '../../utils/bigint-scaling';

// ERC-20 ABI for metadata functions
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)', 
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)'
];

export type DecimalsResult = 
  | { ok: true; decimals: number }
  | { ok: false; error: string };

export type TokenMetadata = {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  error?: string;
};

export class TokenMetadataService {
  
  /**
   * Safely fetch token decimals with validation
   */
  async fetchTokenDecimals(tokenAddress: string): Promise<DecimalsResult> {
    try {
      if (!httpProvider) {
        return { ok: false, error: 'provider_not_configured' };
      }
      
      const result = await withRetry(async () => {
        const contract = new Contract(tokenAddress, ERC20_ABI, httpProvider!);
        const decimals = await (contract['decimals'] as any)();
        return Number(decimals);
      }, `fetchDecimals(${tokenAddress.slice(0, 8)}...)`);
      
      // Sanity check
      if (typeof result !== 'number' || result < 0 || result > 36) {
        return { ok: false, error: 'invalid_decimals_value' };
      }
      
      return { ok: true, decimals: result };
      
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : 'unknown_error' 
      };
    }
  }
  
  /**
   * Fetch complete token metadata
   */
  async fetchTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    const metadata: TokenMetadata = {
      address: tokenAddress
    };
    
    try {
      if (!httpProvider) {
        metadata.error = 'provider_not_configured';
        return metadata;
      }
      
      const contract = new Contract(tokenAddress, ERC20_ABI, httpProvider!);
      
      // Fetch all metadata with individual error handling
      const results = await Promise.allSettled([
        withRetry(() => (contract['name'] as any)(), `name(${tokenAddress.slice(0, 8)}...)`),
        withRetry(() => (contract['symbol'] as any)(), `symbol(${tokenAddress.slice(0, 8)}...)`),
        withRetry(() => (contract['decimals'] as any)(), `decimals(${tokenAddress.slice(0, 8)}...)`),
        withRetry(() => (contract['totalSupply'] as any)(), `totalSupply(${tokenAddress.slice(0, 8)}...)`)
      ]);
      
      // Process name
      if (results[0].status === 'fulfilled') {
        metadata.name = results[0].value as string;
      }
      
      // Process symbol
      if (results[1].status === 'fulfilled') {
        metadata.symbol = results[1].value as string;
      }
      
      // Process decimals with validation
      if (results[2].status === 'fulfilled') {
        const decimals = Number(results[2].value);
        if (decimals >= 0 && decimals <= 36) {
          metadata.decimals = decimals;
        }
      }
      
      // Process total supply
      if (results[3].status === 'fulfilled') {
        metadata.totalSupply = (results[3].value as bigint).toString();
      }
      
      // Validate NAD.FUN token standards
      if (metadata.decimals !== undefined && metadata.totalSupply) {
        const validation = validateNadFunToken({
          decimals: metadata.decimals,
          totalSupply: metadata.totalSupply
        });
        
        if (!validation.valid) {
          console.warn(`⚠️  Token ${tokenAddress.slice(0, 8)}... validation issues:`, validation.issues);
        }
      }
      
      // Check if we got at least some data
      if (!metadata.name && !metadata.symbol && metadata.decimals === undefined) {
        metadata.error = 'no_metadata_available';
      }
      
    } catch (error) {
      metadata.error = error instanceof Error ? error.message : 'fetch_failed';
    }
    
    return metadata;
  }
  
  /**
   * Batch fetch metadata for multiple tokens with concurrency control
   */
  async fetchBatchMetadata(
    tokenAddresses: string[], 
    concurrency: number = 10
  ): Promise<TokenMetadata[]> {
    const results: TokenMetadata[] = [];
    
    // Process in batches to avoid overwhelming the RPC
    for (let i = 0; i < tokenAddresses.length; i += concurrency) {
      const batch = tokenAddresses.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(
        batch.map(address => this.fetchTokenMetadata(address))
      );
      
      results.push(...batchResults);
      
      // Progress logging
      console.log(`Processed ${Math.min(i + concurrency, tokenAddresses.length)}/${tokenAddresses.length} tokens`);
      
      // Rate limiting between batches
      if (i + concurrency < tokenAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Check if token metadata is complete
   */
  isMetadataComplete(metadata: TokenMetadata): boolean {
    return !!(metadata.name && metadata.symbol && metadata.decimals !== undefined);
  }
  
  /**
   * Get summary statistics for batch results
   */
  getBatchSummary(results: TokenMetadata[]): {
    total: number;
    successful: number;
    withDecimals: number;
    failed: number;
    decimalDistribution: Record<number, number>;
  } {
    const summary = {
      total: results.length,
      successful: 0,
      withDecimals: 0,
      failed: 0,
      decimalDistribution: {} as Record<number, number>
    };
    
    results.forEach(result => {
      if (result.error) {
        summary.failed++;
      } else {
        summary.successful++;
      }
      
      if (result.decimals !== undefined) {
        summary.withDecimals++;
        summary.decimalDistribution[result.decimals] = 
          (summary.decimalDistribution[result.decimals] || 0) + 1;
      }
    });
    
    return summary;
  }
}