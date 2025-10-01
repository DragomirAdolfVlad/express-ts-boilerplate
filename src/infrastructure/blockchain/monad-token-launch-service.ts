/**
 * Monad Token Launch Service
 * 
 * Comprehensive token launch detection combining multiple methods:
 * 1. Factory contract monitoring (TokenCreated events)
 * 2. First trade detection (fallback method)
 * 3. Manual token registration (API endpoint)
 * 4. Metadata enrichment from various sources
 */
import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { OptimizedTokenCreationTracker } from './optimized-tracker';
import { nadFunApi } from '../external/nadfun-api.service';

interface TokenLaunchData {
  tokenAddress: string;
  creator: string;
  bondingCurve: string;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  blockNumber: string;
  blockHash: string;
  timestamp: Date;
  transactionHash: string;
  source: 'factory' | 'first_trade' | 'manual' | 'api';
}

export class MonadTokenLaunchService {
  private tokenCreationTracker: OptimizedTokenCreationTracker;
  private isRunning = false;

  constructor(
    private provider: JsonRpcProvider | WebSocketProvider,
    private prisma: PrismaClient,
    httpProvider?: JsonRpcProvider
  ) {
    this.tokenCreationTracker = new OptimizedTokenCreationTracker(provider, prisma, httpProvider);
  }

  /**
   * Start comprehensive token launch monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('🚀 Starting Monad Token Launch Service...');
    console.log('   🏭 Factory event monitoring');
    console.log('   📊 First trade detection');
    console.log('   🔍 Metadata enrichment');
    
    this.isRunning = true;

    // Start the token creation tracker
    await this.tokenCreationTracker.start();

    // Start additional monitoring services
    await this.startMetadataEnrichment();
    await this.startPeriodicBackfill();

    console.log('✅ Monad Token Launch Service started successfully');
  }

  /**
   * Register a new token manually (for API endpoints)
   */
  async registerToken(tokenData: {
    tokenAddress: string;
    creator?: string;
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  }): Promise<void> {
    try {
      console.log(`📝 MANUAL: Registering token ${tokenData.tokenAddress}`);

      // Get current block info
      const latestBlock = await this.provider.getBlockNumber();
      const block = await this.provider.getBlock(latestBlock);

      const launchData: TokenLaunchData = {
        tokenAddress: tokenData.tokenAddress,
        creator: tokenData.creator || 'unknown',
        bondingCurve: 'unknown', // Will be resolved later
        name: tokenData.name,
        symbol: tokenData.symbol,
        description: tokenData.description,
        image: tokenData.image,
        website: tokenData.website,
        twitter: tokenData.twitter,
        telegram: tokenData.telegram,
        blockNumber: latestBlock.toString(),
        blockHash: block?.hash || 'unknown',
        timestamp: new Date(),
        transactionHash: 'manual',
        source: 'manual'
      };

      await this.processTokenLaunch(launchData);

    } catch (error) {
      console.error(`❌ MANUAL: Failed to register token ${tokenData.tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Process token launch from any source
   */
  async processTokenLaunch(launchData: TokenLaunchData): Promise<void> {
    try {
      // Check if token already exists
      const existingToken = await this.prisma.monadLaunchedToken.findUnique({
        where: { token: launchData.tokenAddress }
      });

      if (existingToken) {
        // Update with better data if available
        await this.updateExistingToken(launchData);
        return;
      }

      // Create new token record
      await this.prisma.monadLaunchedToken.create({
        data: {
          platform: 'monad',
          signature: launchData.transactionHash,
          creator: launchData.creator,
          token: launchData.tokenAddress,
          bondingCurve: launchData.bondingCurve,
          blockNumber: launchData.blockNumber,
          blockId: launchData.blockHash,
          commitState: 'verified',
          timestamp: launchData.timestamp,
          name: launchData.name,
          symbol: launchData.symbol
        }
      });

      // Save detailed metadata if available
      if (this.hasExtendedMetadata(launchData)) {
        await this.saveExtendedMetadata(launchData);
      }

      // Initialize token stats
      await this.initializeTokenStats(launchData.tokenAddress, launchData.timestamp);

      console.log(`🎉 TOKEN LAUNCHED: ${launchData.tokenAddress}`);
      console.log(`   👤 Creator: ${launchData.creator}`);
      console.log(`   📛 Name: ${launchData.name || 'Unknown'}`);
      console.log(`   🔤 Symbol: ${launchData.symbol || 'Unknown'}`);
      console.log(`   📡 Source: ${launchData.source}`);

      // Emit launch event
      this.emitTokenLaunchEvent(launchData);

    } catch (error) {
      console.error(`❌ LAUNCH: Failed to process token launch ${launchData.tokenAddress}:`, error);
      throw error;
    }
  }

  /**
   * Update existing token with better data
   */
  private async updateExistingToken(launchData: TokenLaunchData): Promise<void> {
    const updates: any = {};

    // Update creator if we have better info
    if (launchData.creator !== 'unknown') {
      updates.creator = launchData.creator;
    }

    // Update bonding curve if we have it
    if (launchData.bondingCurve !== 'unknown') {
      updates.bondingCurve = launchData.bondingCurve;
    }

    // Update name/symbol if we have them
    if (launchData.name) updates.name = launchData.name;
    if (launchData.symbol) updates.symbol = launchData.symbol;

    if (Object.keys(updates).length > 0) {
      await this.prisma.monadLaunchedToken.update({
        where: { token: launchData.tokenAddress },
        data: updates
      });

      console.log(`🔄 UPDATED: Enhanced data for ${launchData.tokenAddress}`);
    }

    // Update metadata if we have extended info
    if (this.hasExtendedMetadata(launchData)) {
      await this.saveExtendedMetadata(launchData);
    }
  }

  /**
   * Check if launch data has extended metadata
   */
  private hasExtendedMetadata(launchData: TokenLaunchData): boolean {
    return !!(
      launchData.description ||
      launchData.image ||
      launchData.website ||
      launchData.twitter ||
      launchData.telegram
    );
  }

  /**
   * Save extended metadata
   */
  private async saveExtendedMetadata(launchData: TokenLaunchData): Promise<void> {
    try {
      // Check if token already has metadata
      const token = await this.prisma.monadLaunchedToken.findUnique({
        where: { token: launchData.tokenAddress },
        select: { metadataId: true }
      });

      if (token?.metadataId) {
        // Update existing metadata
        await this.prisma.monadTokenMetadata.update({
          where: { id: token.metadataId },
          data: {
            name: launchData.name || '',
            symbol: launchData.symbol || '',
            description: launchData.description,
            image: launchData.image,
            website: launchData.website ? { url: launchData.website } : undefined,
            twitter: launchData.twitter,
            telegram: launchData.telegram,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new metadata
        const metadata = await this.prisma.monadTokenMetadata.create({
          data: {
            name: launchData.name || '',
            symbol: launchData.symbol || '',
            description: launchData.description,
            image: launchData.image,
            website: launchData.website ? { url: launchData.website } : undefined,
            twitter: launchData.twitter,
            telegram: launchData.telegram
          }
        });

        // Link to token
        await this.prisma.monadLaunchedToken.update({
          where: { token: launchData.tokenAddress },
          data: { metadataId: metadata.id }
        });
      }

      console.log(`📝 METADATA: Saved extended data for ${launchData.tokenAddress}`);

    } catch (error) {
      console.error(`❌ METADATA: Failed to save for ${launchData.tokenAddress}:`, error);
    }
  }

  /**
   * Initialize token statistics
   */
  private async initializeTokenStats(tokenAddress: string, timestamp: Date): Promise<void> {
    try {
      await this.prisma.monadTokenTradeStats.upsert({
        where: { tokenAddress },
        create: {
          tokenAddress,
          totalTxCount: 0,
          totalWmonVolume: '0',
          totalUsdVolume: '0',
          buyCount: 0,
          sellCount: 0,
          buyVolumeUsd: '0',
          sellVolumeUsd: '0',
          creatorHoldings: '0',
          creatorSold: false,
          lastTradeTime: timestamp,
          proposedTrades: 0,
          finalizedTrades: 0,
          verifiedTrades: 0
        },
        update: {} // Don't overwrite existing stats
      });

    } catch (error) {
      console.error(`❌ STATS: Failed to initialize for ${tokenAddress}:`, error);
    }
  }

  /**
   * Start metadata enrichment service
   */
  private async startMetadataEnrichment(): Promise<void> {
    console.log('🔍 Starting metadata enrichment service...');

    // Run every 5 minutes to enrich tokens with missing metadata
    setInterval(async () => {
      await this.enrichMissingMetadata();
    }, 5 * 60 * 1000);
  }

  /**
   * Enrich tokens with missing metadata
   */
  private async enrichMissingMetadata(): Promise<void> {
    try {
      // Find tokens with missing metadata
      const tokensNeedingMetadata = await this.prisma.monadLaunchedToken.findMany({
        where: {
          OR: [
            { name: null },
            { symbol: null },
            { metadataId: null }
          ]
        },
        take: 10, // Process 10 at a time
        orderBy: { timestamp: 'desc' }
      });

      for (const token of tokensNeedingMetadata) {
        await this.enrichTokenMetadata(token.token);
        // Small delay to avoid overwhelming external APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.error('❌ ENRICHMENT: Failed to enrich metadata:', error);
    }
  }

  /**
   * Enrich metadata for a specific token
   */
  private async enrichTokenMetadata(tokenAddress: string): Promise<void> {
    try {
      // Try to get metadata from various sources:
      // 1. On-chain token contract (name, symbol)
      // 2. IPFS metadata (if available)
      // 3. Social media APIs
      // 4. Token registry APIs

      console.log(`🔍 ENRICHING: ${tokenAddress}`);

      // For now, this is a placeholder
      // In production, you'd implement actual metadata fetching
      const enrichedData = await this.fetchTokenMetadataFromSources(tokenAddress);

      if (enrichedData) {
        await this.updateExistingToken({
          tokenAddress,
          creator: 'unknown',
          bondingCurve: 'unknown',
          blockNumber: '0',
          blockHash: 'unknown',
          timestamp: new Date(),
          transactionHash: 'enrichment',
          source: 'api',
          ...enrichedData
        });
      }

    } catch (error) {
      console.warn(`⚠️  ENRICHMENT: Failed to enrich ${tokenAddress}:`, error);
    }
  }

  /**
   * Fetch token metadata from NAD.FUN API and other sources
   */
  private async fetchTokenMetadataFromSources(tokenAddress: string): Promise<Partial<TokenLaunchData> | null> {
    try {
      // Primary source: NAD.FUN API
      const nadFunMetadata = await nadFunApi.getTokenMetadata(tokenAddress);
      
      if (nadFunMetadata) {
        return {
          name: nadFunMetadata.name,
          symbol: nadFunMetadata.symbol,
          description: nadFunMetadata.description,
          image: nadFunMetadata.image_uri,
          website: nadFunMetadata.website,
          twitter: nadFunMetadata.twitter,
          telegram: nadFunMetadata.telegram,
          creator: nadFunMetadata.creator
        };
      }

      // Fallback sources could be added here:
      // - On-chain contract calls for name/symbol
      // - IPFS metadata fetching
      // - Other token registry APIs
      
      return null;
    } catch (error) {
      console.warn(`⚠️  SOURCES: Failed to fetch metadata for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Start periodic backfill service
   */
  private async startPeriodicBackfill(): Promise<void> {
    console.log('🔄 Starting periodic backfill service...');

    // Run backfill every hour
    setInterval(async () => {
      await this.tokenCreationTracker.backfillTokenCreations();
    }, 60 * 60 * 1000);
  }

  /**
   * Emit token launch event for real-time updates
   */
  private emitTokenLaunchEvent(launchData: TokenLaunchData): void {
    console.log(`📡 EMIT: token_launched`, {
      tokenAddress: launchData.tokenAddress,
      creator: launchData.creator,
      name: launchData.name,
      symbol: launchData.symbol,
      source: launchData.source,
      blockNumber: launchData.blockNumber
    });

    // TODO: Integrate with WebSocket/SSE system
    // this.websocketService.emit('token_launched', launchData);
  }

  /**
   * Get launch service statistics
   */
  async getStats(): Promise<{
    totalTokens: number;
    recentLaunches: number;
    sourcesBreakdown: Record<string, number>;
    metadataCompleteness: number;
  }> {
    try {
      const totalTokens = await this.prisma.monadLaunchedToken.count();
      
      const recentLaunches = await this.prisma.monadLaunchedToken.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      const tokensWithMetadata = await this.prisma.monadLaunchedToken.count({
        where: {
          AND: [
            { name: { not: null } },
            { symbol: { not: null } }
          ]
        }
      });

      const metadataCompleteness = totalTokens > 0 ? (tokensWithMetadata / totalTokens) * 100 : 0;

      return {
        totalTokens,
        recentLaunches,
        sourcesBreakdown: {
          factory: 0, // Would need to query by source
          first_trade: 0,
          manual: 0,
          api: 0
        },
        metadataCompleteness
      };

    } catch (error) {
      console.error('❌ STATS: Failed to get launch service stats:', error);
      return {
        totalTokens: 0,
        recentLaunches: 0,
        sourcesBreakdown: {},
        metadataCompleteness: 0
      };
    }
  }

  /**
   * Stop the launch service
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    await this.tokenCreationTracker.stop();
    console.log('🛑 Monad Token Launch Service stopped');
  }
}