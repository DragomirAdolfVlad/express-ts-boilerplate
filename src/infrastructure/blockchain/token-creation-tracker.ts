/**
 * Token Creation Tracker
 * 
 * Detects new token launches on NAD.FUN platform by monitoring
 * factory contract events and first trade transactions
 */
import { JsonRpcProvider, WebSocketProvider, ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { nadFunApi } from '../external/nadfun-api.service';

interface TokenCreationEvent {
  tokenAddress: string;
  creator: string;
  bondingCurve: string;
  blockNumber: string;
  blockHash: string;
  timestamp: Date;
  transactionHash: string;
  logIndex: number;
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  totalSupply?: string;
}

export class TokenCreationTracker {
  private isRunning = false;
  private httpProvider: JsonRpcProvider;

  constructor(
    private provider: JsonRpcProvider | WebSocketProvider,
    private prisma: PrismaClient,
    httpProvider?: JsonRpcProvider
  ) {
    // Use provided HTTP provider or create one if needed
    this.httpProvider = httpProvider || (provider instanceof JsonRpcProvider ? provider : new JsonRpcProvider(process.env['MONAD_RPC_URL']));
  }

  /**
   * Start monitoring for new token creations
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🚀 Starting Token Creation Tracker...');
    console.log('   📡 Monitoring NAD.FUN factory for new token launches');
    
    this.isRunning = true;

    // Method 1: Monitor factory contract events (if we have the factory address)
    await this.startFactoryEventMonitoring();

    // Method 2: Detect new tokens from first trades (fallback method)
    await this.startFirstTradeMonitoring();

    console.log('✅ Token Creation Tracker started successfully');
  }

  /**
   * Monitor bonding curve contract for CurveCreate events AND all individual pools for trades
   */
  private async startFactoryEventMonitoring(): Promise<void> {
    try {
      // Use the bonding curve contract address - it emits CurveCreate events
      const BONDING_CURVE_ADDRESS = process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
      
      console.log(`📡 CURVE CREATE: Monitoring ${BONDING_CURVE_ADDRESS} for CurveCreate events`);
      console.log(`📡 TRADES: Monitoring ALL individual bonding curve pools for trades`);

      // Listen for new blocks and check for ALL events (CurveCreate + CurveBuy + CurveSell)
      if (this.provider instanceof WebSocketProvider) {
        this.provider.on('block', async (blockNumber) => {
          // Add small delay to ensure block is fully available
          setTimeout(async () => {
            await this.checkCurveCreateEventsInBlock(blockNumber, BONDING_CURVE_ADDRESS);
            await this.checkAllPoolTradesInBlock(blockNumber);
          }, 500); // 500ms delay
        });
      } else {
        // Polling mode for HTTP provider
        setInterval(async () => {
          const latestBlock = await this.provider.getBlockNumber();
          // Query a slightly older block to ensure it's available
          const safeBlock = Math.max(0, latestBlock - 1);
          await this.checkCurveCreateEventsInBlock(safeBlock, BONDING_CURVE_ADDRESS);
          await this.checkAllPoolTradesInBlock(safeBlock);
        }, 2000); // Check every 2 seconds
      }

    } catch (error) {
      console.error('❌ CURVE CREATE: Failed to start monitoring:', error);
    }
  }

  /**
   * Check for CurveCreate events in a specific block
   */
  private async checkCurveCreateEventsInBlock(blockNumber: number, bondingCurveAddress: string): Promise<void> {
    try {
      // Import the dynamic topic hash function
      const { getEventTopicHash, BONDING_CURVE_EVENTS } = await import('./abis/official-nad-fun.abi');
      
      // Get the correct topic hash for CurveCreate event
      const curveCreateTopic = await getEventTopicHash(BONDING_CURVE_EVENTS.CurveCreate);
      
      // Add retry logic for "invalid block range" errors
      let retries = 3;
      let logs: any[] = [];
      
      while (retries > 0) {
        try {
          logs = await this.provider.getLogs({
            fromBlock: blockNumber,
            toBlock: blockNumber,
            address: bondingCurveAddress,
            topics: [curveCreateTopic] // Filter for CurveCreate events only
          });
          break; // Success, exit retry loop
        } catch (logError: any) {
          if (logError.message?.includes('invalid block range') && retries > 1) {
            console.warn(`⚠️  CURVE CREATE: Block ${blockNumber} not ready, retrying in 1s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries--;
          } else {
            throw logError; // Re-throw if not a block range error or no retries left
          }
        }
      }

      if (logs.length > 0) {
        console.log(`🔍 CURVE CREATE: Checking block ${blockNumber}, found ${logs.length} CurveCreate events`);
      }

      for (const log of logs) {
        await this.processCurveCreateEvent(log);
      }

    } catch (error) {
      console.error(`❌ CURVE CREATE: Error checking block ${blockNumber}:`, error);
    }
  }

  /**
   * Process CurveCreate event from bonding curve contract
   */
  private async processCurveCreateEvent(log: any): Promise<void> {
    try {
      // Import ethers for decoding
      const { ethers } = await import('ethers');
      const { BONDING_CURVE_ABI } = await import('./abis/official-nad-fun.abi');
      
      // Create interface for decoding
      const iface = new ethers.Interface(BONDING_CURVE_ABI);
      
      // Decode the CurveCreate event
      const decoded = iface.parseLog({
        topics: log.topics,
        data: log.data
      });

      if (!decoded || decoded.name !== 'CurveCreate') {
        console.warn('❌ CURVE CREATE: Failed to decode or wrong event type');
        return;
      }

      // Extract data from the decoded event
      // CurveCreate(address creator, address token, address pool, string name, string symbol, string tokenURI, uint256 virtualMon, uint256 virtualToken, uint256 targetTokenAmount)
      const {
        creator,
        token: tokenAddress,
        pool: bondingCurve,
        name,
        symbol,
        tokenURI: _tokenURI, // Prefix with _ to indicate intentionally unused
        virtualMon: _virtualMon,
        virtualToken: _virtualToken,
        targetTokenAmount
      } = decoded.args;

      console.log(`🎉 CURVE CREATE: New token detected!`);
      console.log(`   📛 Name: ${name}`);
      console.log(`   🔤 Symbol: ${symbol}`);
      console.log(`   👤 Creator: ${creator}`);
      console.log(`   🏠 Token: ${tokenAddress}`);
      console.log(`   🔗 Pool: ${bondingCurve}`);

      // Try to get additional metadata from NAD.FUN API
      console.log(`🔍 METADATA: Fetching metadata for ${tokenAddress} from NAD.FUN API...`);
      const metadata = await this.extractTokenMetadata(log.transactionHash, tokenAddress);
      console.log(`📝 METADATA: Retrieved:`, metadata ? 'SUCCESS' : 'FAILED');

      const tokenCreation: TokenCreationEvent = {
        tokenAddress,
        creator,
        bondingCurve,
        blockNumber: log.blockNumber.toString(),
        blockHash: log.blockHash || 'unknown',
        timestamp: new Date(), // Will be updated with real block timestamp
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        name: metadata?.name || name,
        symbol: metadata?.symbol || symbol,
        description: metadata?.description,
        image: metadata?.image,
        website: metadata?.website,
        twitter: metadata?.twitter,
        telegram: metadata?.telegram,
        totalSupply: metadata?.totalSupply || targetTokenAmount.toString()
      };

      await this.processTokenCreation(tokenCreation);

    } catch (error) {
      console.error('❌ CURVE CREATE: Failed to process CurveCreate event:', error);
    }
  }

  /**
   * Monitor for first trades to detect new tokens (fallback method)
   */
  private async startFirstTradeMonitoring(): Promise<void> {
    console.log('📡 FIRST-TRADE: Monitoring for new tokens via first trades');

    // This runs alongside the main trade tracker
    // When we see a trade for a token that doesn't exist in our DB,
    // we treat it as a new token creation
    
    // This is handled in the main trade processing pipeline
    // by checking if token exists before processing trades
  }

  /**
   * Detect new token from first trade (called by trade processor)
   */
  async detectTokenFromFirstTrade(
    tokenAddress: string,
    tradeSignature: string,
    logIndex: number,
    trader: string,
    blockNumber: string,
    blockHash: string,
    timestamp: Date
  ): Promise<void> {
    try {
      // Check if token already exists
      const existingToken = await this.prisma.monadLaunchedToken.findUnique({
        where: { token: tokenAddress }
      });

      if (existingToken) {
        return; // Token already tracked
      }

      console.log(`🆕 NEW TOKEN: Detected from first trade - ${tokenAddress}`);

      // Try to get complete token metadata from NAD.FUN API
      const metadata = await this.extractTokenMetadata(tradeSignature, tokenAddress);

      // Create token creation event with rich metadata
      const tokenCreation: TokenCreationEvent = {
        tokenAddress,
        creator: metadata?.creator || trader, // Use API creator if available, fallback to first trader
        bondingCurve: process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701', // Use default bonding curve
        blockNumber,
        blockHash,
        timestamp,
        transactionHash: tradeSignature,
        logIndex,
        name: metadata?.name,
        symbol: metadata?.symbol,
        description: metadata?.description,
        image: metadata?.image,
        website: metadata?.website,
        twitter: metadata?.twitter,
        telegram: metadata?.telegram
      };

      await this.processTokenCreation(tokenCreation);

    } catch (error) {
      console.error(`❌ FIRST-TRADE: Failed to detect token ${tokenAddress}:`, error);
    }
  }

  /**
   * Process token creation event and save to database
   */
  private async processTokenCreation(creation: TokenCreationEvent): Promise<void> {
    try {
      // Get accurate block timestamp
      const block = await this.provider.getBlock(parseInt(creation.blockNumber));
      const accurateTimestamp = block ? new Date(block.timestamp * 1000) : creation.timestamp;

      // Save token to database
      await this.prisma.monadLaunchedToken.upsert({
        where: { token: creation.tokenAddress },
        create: {
          platform: 'monad',
          signature: creation.transactionHash,
          creator: creation.creator,
          token: creation.tokenAddress,
          bondingCurve: creation.bondingCurve,
          blockNumber: creation.blockNumber,
          blockId: creation.blockHash,
          commitState: 'verified', // Token creation is always verified
          timestamp: accurateTimestamp,
          name: creation.name,
          symbol: creation.symbol
        },
        update: {
          // Update if we get better data later
          bondingCurve: creation.bondingCurve !== 'unknown' ? creation.bondingCurve : undefined,
          name: creation.name || undefined,
          symbol: creation.symbol || undefined,
          creator: creation.creator !== 'unknown' ? creation.creator : undefined
        }
      });

      // Try to fetch and save detailed metadata (including rich metadata from API)
      if (creation.name || creation.symbol || creation.description || creation.image || creation.website || creation.twitter || creation.telegram) {
        await this.saveTokenMetadata(creation.tokenAddress, {
          name: creation.name,
          symbol: creation.symbol,
          description: creation.description,
          image: creation.image,
          website: creation.website,
          twitter: creation.twitter,
          telegram: creation.telegram
        });
      }

      console.log(`✅ TOKEN CREATED: ${creation.tokenAddress} by ${creation.creator}`);
      console.log(`   📊 Name: ${creation.name || 'Unknown'}`);
      console.log(`   🔗 Bonding Curve: ${creation.bondingCurve}`);
      console.log(`   📦 Block: ${creation.blockNumber}`);

      // Emit event for real-time UI updates
      this.emitTokenCreationEvent(creation);

    } catch (error) {
      console.error(`❌ TOKEN CREATION: Failed to process ${creation.tokenAddress}:`, error);
    }
  }

  /**
   * Extract token metadata from NAD.FUN API
   */
  private async extractTokenMetadata(_txHash: string, tokenAddress: string): Promise<{
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    creator?: string;
    totalSupply?: string;
  } | null> {
    try {
      // Use dedicated NAD.FUN API service
      const metadata = await nadFunApi.getTokenMetadata(tokenAddress);
      
      if (!metadata) {
        return null;
      }
      
      return {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        image: metadata.image_uri,
        website: metadata.website,
        twitter: metadata.twitter,
        telegram: metadata.telegram,
        creator: metadata.creator,
        totalSupply: metadata.total_supply
      };

    } catch (error) {
      console.warn(`⚠️  METADATA: Failed to fetch from NAD.FUN API for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Save detailed token metadata
   */
  private async saveTokenMetadata(tokenAddress: string, metadata: {
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  }): Promise<void> {
    try {
      // Create metadata record
      const tokenMetadata = await this.prisma.monadTokenMetadata.create({
        data: {
          name: metadata.name || '',
          symbol: metadata.symbol || '',
          description: metadata.description,
          image: metadata.image,
          website: metadata.website || undefined, // Save as string, not object
          twitter: metadata.twitter,
          telegram: metadata.telegram
        }
      });

      // Link to token
      await this.prisma.monadLaunchedToken.update({
        where: { token: tokenAddress },
        data: { metadataId: tokenMetadata.id }
      });

      console.log(`📝 METADATA: Saved for ${tokenAddress}`);

    } catch (error) {
      console.error(`❌ METADATA: Failed to save for ${tokenAddress}:`, error);
    }
  }

  /**
   * Emit token creation event for real-time updates
   */
  private emitTokenCreationEvent(creation: TokenCreationEvent): void {
    // Emit to WebSocket clients, SSE, etc.
    console.log(`📡 EMIT: token_created`, {
      tokenAddress: creation.tokenAddress,
      creator: creation.creator,
      name: creation.name,
      symbol: creation.symbol,
      bondingCurve: creation.bondingCurve,
      blockNumber: creation.blockNumber
    });

    // TODO: Integrate with your WebSocket/SSE system
    // this.websocketService.emit('token_created', creation);
  }

  /**
   * Backfill missing token creation data
   */
  async backfillTokenCreations(): Promise<void> {
    console.log('🔄 BACKFILL: Starting token creation backfill...');

    try {
      // Find tokens that might be missing creation data
      const tokensWithTrades = await this.prisma.monadTokenTrade.findMany({
        select: { 
          tokenAddress: true,
          signature: true,
          logIndex: true,
          trader: true,
          blockNumber: true,
          timestamp: true
        },
        distinct: ['tokenAddress'],
        orderBy: { timestamp: 'asc' }
      });

      console.log(`🔄 BACKFILL: Found ${tokensWithTrades.length} tokens to check`);

      for (const trade of tokensWithTrades) {
        await this.detectTokenFromFirstTrade(
          trade.tokenAddress,
          trade.signature || '',
          trade.logIndex || 0,
          trade.trader,
          trade.blockNumber,
          'unknown', // Block hash not stored in old trades
          trade.timestamp
        );

        // Small delay to avoid overwhelming RPC
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('✅ BACKFILL: Token creation backfill completed');

    } catch (error) {
      console.error('❌ BACKFILL: Failed to backfill token creations:', error);
    }
  }

  /**
   * Check ALL individual bonding curve pools for trade events in a specific block
   */
  private async checkAllPoolTradesInBlock(blockNumber: number): Promise<void> {
    try {
      // Import the dynamic topic hash function
      const { getEventTopicHash, BONDING_CURVE_EVENTS } = await import('./abis/official-nad-fun.abi');
      
      // Get topic hashes for trade events - support multiple signatures
      const curveBuyTopic = await getEventTopicHash(BONDING_CURVE_EVENTS.CurveBuy);
      const curveSellTopic = await getEventTopicHash(BONDING_CURVE_EVENTS.CurveSell);
      
      // Additional possible event signatures that some tokens might use
      const alternativeBuyTopics = [
        ethers.id('Buy(address,address,uint256,uint256)'),
        ethers.id('TokenBuy(address,address,uint256,uint256)'),
        ethers.id('BondingCurveBuy(address,address,uint256,uint256)'),
      ];
      
      const alternativeSellTopics = [
        ethers.id('Sell(address,address,uint256,uint256)'),
        ethers.id('TokenSell(address,address,uint256,uint256)'),
        ethers.id('BondingCurveSell(address,address,uint256,uint256)'),
      ];
      
      // Combine all possible topics
      const allBuyTopics = [curveBuyTopic, ...alternativeBuyTopics];
      const allSellTopics = [curveSellTopic, ...alternativeSellTopics];
      const allTradeTopics = [...allBuyTopics, ...allSellTopics];
      
      // Only log once per startup
      if (blockNumber % 100 === 0) {
        console.log(`🔍 MONITORING: BUY=${curveBuyTopic.slice(0,10)}..., SELL=${curveSellTopic.slice(0,10)}...`);
      }
      
      // Get ALL bonding curve pool addresses
      const allBondingCurves = await this.getAllBondingCurveAddresses();
      
      if (allBondingCurves.length === 0) {
        if (blockNumber % 50 === 0) {
          console.log(`⚠️  No bonding curve pools to monitor yet in block ${blockNumber}`);
        }
        return; // No pools to monitor yet
      }
      
      if (blockNumber % 50 === 0) {
        console.log(`🔍 Monitoring ${allBondingCurves.length} bonding curve pools in block ${blockNumber}`);
      }
      
      // Add retry logic for "invalid block range" errors
      let retries = 3;
      let allLogs: any[] = [];
      
      while (retries > 0) {
        try {
          // Check BOTH factory contract AND individual bonding curve pools for trade events
          const factoryAddress = process.env['CONTRACT_ADDRESS'] || '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
          const allAddresses = [factoryAddress, ...allBondingCurves];
          
          const logPromises = allAddresses.map(async (contractAddress) => {
            try {
              return await this.provider.getLogs({
                fromBlock: blockNumber,
                toBlock: blockNumber,
                address: contractAddress,
                topics: [allTradeTopics]
              });
            } catch (contractError) {
              // Ignore errors from individual contracts
              return [];
            }
          });
          
          const allPoolLogs = await Promise.all(logPromises);
          allLogs = allPoolLogs.flat();
          
          if (blockNumber % 50 === 0 && allLogs.length > 0) {
            console.log(`🔍 Found ${allLogs.length} total logs from ${allBondingCurves.length} pools in block ${blockNumber}`);
          }
          
          break; // Success, exit retry loop
        } catch (logError: any) {
          if (logError.message?.includes('invalid block range') && retries > 1) {
            console.warn(`⚠️  TRADES: Block ${blockNumber} not ready, retrying in 1s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries--;
          } else {
            throw logError; // Re-throw if not a block range error or no retries left
          }
        }
      }

      if (allLogs.length > 0) {
        const buyEvents = allLogs.filter(log => allBuyTopics.includes(log.topics[0]));
        const sellEvents = allLogs.filter(log => allSellTopics.includes(log.topics[0]));
        
        console.log(`📊 TRADES: Block ${blockNumber} - Found ${buyEvents.length} BUY and ${sellEvents.length} SELL events (${allLogs.length} total)`);
        
        // Debug: Show all event topics found
        const uniqueTopics = [...new Set(allLogs.map(log => log.topics[0]))];
        console.log(`   Topics found: ${uniqueTopics.map(t => t.slice(0, 10) + '...').join(', ')}`);
        console.log(`   Expected BUY topics: ${allBuyTopics.length} variations`);
        console.log(`   Expected SELL topics: ${allSellTopics.length} variations`);
        
        // Debug: Show contract addresses for unmatched events
        const unmatchedLogs = allLogs.filter(log => 
          !allTradeTopics.includes(log.topics[0])
        );
        if (unmatchedLogs.length > 0) {
          console.log(`   🔍 Unmatched events from contracts:`);
          const contractCounts = new Map();
          unmatchedLogs.forEach(log => {
            const addr = log.address.slice(0, 10) + '...';
            contractCounts.set(addr, (contractCounts.get(addr) || 0) + 1);
          });
          for (const [addr, count] of contractCounts.entries()) {
            console.log(`      ${addr}: ${count} events`);
          }
        }
      }

      for (const log of allLogs) {
        console.log(`🔄 Processing trade event: ${log.topics[0].slice(0, 10)}... from ${log.address.slice(0, 10)}...`);
        await this.processTradeEvent(log);
      }

    } catch (error) {
      console.error(`❌ TRADES: Error checking block ${blockNumber}:`, error);
    }
  }



  /**
   * Process trade event (CurveBuy/CurveSell)
   */
  private async processTradeEvent(log: any): Promise<void> {
    try {
      // Try to decode the log using multiple possible ABIs
      let decoded: any = null;
      
      // First try with our main ABI
      try {
        const { BONDING_CURVE_ABI } = await import('./abis/official-nad-fun.abi');
        const iface = new ethers.Interface(BONDING_CURVE_ABI);
        decoded = iface.parseLog({ topics: log.topics, data: log.data });
      } catch (mainAbiError) {
        // If main ABI fails, try alternative event signatures
        const alternativeSignatures = [
          'Buy(address,address,uint256,uint256)',
          'Sell(address,address,uint256,uint256)',
          'TokenBuy(address,address,uint256,uint256)',
          'TokenSell(address,address,uint256,uint256)',
          'BondingCurveBuy(address,address,uint256,uint256)',
          'BondingCurveSell(address,address,uint256,uint256)',
        ];
        
        for (const signature of alternativeSignatures) {
          try {
            const tempInterface = new ethers.Interface([`event ${signature}`]);
            decoded = tempInterface.parseLog({ topics: log.topics, data: log.data });
            console.log(`✅ TRADES: Decoded using alternative signature: ${signature}`);
            break;
          } catch (altError) {
            // Continue to next signature
          }
        }
      }
      
      if (!decoded) {
        console.warn(`❌ TRADES: Could not decode log with any known signature`);
        console.warn(`   Topic: ${log.topics[0]}`);
        console.warn(`   Contract: ${log.address}`);
        return;
      }
      
      // Check if it's a buy or sell event (support multiple event names)
      const buyEventNames = ['CurveBuy', 'Buy', 'TokenBuy', 'BondingCurveBuy'];
      const sellEventNames = ['CurveSell', 'Sell', 'TokenSell', 'BondingCurveSell'];
      
      const isBuyEvent = buyEventNames.includes(decoded.name);
      const isSellEvent = sellEventNames.includes(decoded.name);
      
      if (!isBuyEvent && !isSellEvent) {
        console.warn(`❌ TRADES: Unknown event type: ${decoded.name}`);
        return;
      }
      
      console.log(`✅ TRADES: Successfully decoded ${decoded.name} event`);

      // Extract data from the decoded event
      // CurveBuy/CurveSell(address sender, address token, uint256 amountIn, uint256 amountOut)
      const {
        sender: trader,
        token: tokenAddress,
        amountIn,
        amountOut
      } = decoded.args;
      
      console.log(`   Token: ${tokenAddress}`);
      console.log(`   Trader: ${trader}`);
      console.log(`   Amount In: ${amountIn.toString()}`);
      console.log(`   Amount Out: ${amountOut.toString()}`);

      const isBuy = isBuyEvent;
      
      // Calculate amounts and price first
      const wmonAmount = isBuy ? amountIn : amountOut;
      const tokenAmount = isBuy ? amountOut : amountIn;
      
      if (!isBuy) {
        console.log(`🎉 SELL TRADE FOUND! Token: ${tokenAddress.slice(0, 10)}... - Trader: ${trader.slice(0, 10)}...`);
        console.log(`   WMON Amount: ${wmonAmount.toString()}`);
        console.log(`   Token Amount: ${tokenAmount.toString()}`);
      }

      // Process the trade using the enhanced trade processor with the dedicated HTTP provider
      const { EnhancedTradeProcessor } = await import('./enhanced-trade-processor');
      const tradeProcessor = new EnhancedTradeProcessor(this.httpProvider, this.prisma);
      const pricePerToken = tokenAmount > 0n ? (wmonAmount * BigInt(1e18)) / tokenAmount : 0n;

      // Mock reserves for now (would need to get from contract)
      const reserves = {
        reserve1: BigInt(0), // Real WMON
        reserve2: BigInt(0), // Real token
        reserve3: BigInt(30000) * BigInt(1e18), // Virtual WMON
        reserve4: BigInt(1000000000) * BigInt(1e18) // Virtual token
      };

      await tradeProcessor.processTradeWithEnhancedData(
        log.transactionHash,
        log.logIndex,
        tokenAddress,
        trader,
        isBuy,
        wmonAmount,
        tokenAmount,
        pricePerToken,
        reserves,
        'finalized'
      );

    } catch (error) {
      console.error('❌ TRADES: Failed to process trade event:', error);
    }
  }

  /**
   * Stop the token creation tracker
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.provider instanceof WebSocketProvider) {
      await this.provider.destroy();
    }
    
    console.log('🛑 Token Creation Tracker stopped');
  }

  private bondingCurveCache: string[] = [];
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get all bonding curve addresses from database (cached)
   */
  private async getAllBondingCurveAddresses(): Promise<string[]> {
    try {
      const now = Date.now();
      
      // Use cache if it's fresh
      if (this.bondingCurveCache.length > 0 && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
        return this.bondingCurveCache;
      }
      
      const tokens = await this.prisma.monadLaunchedToken.findMany({
        where: {
          bondingCurve: {
            not: 'unknown'
          }
        },
        select: {
          bondingCurve: true
        },
        distinct: ['bondingCurve']
      });
      
      this.bondingCurveCache = tokens.map(t => t.bondingCurve).filter(addr => addr && addr !== 'unknown');
      this.lastCacheUpdate = now;
      
      return this.bondingCurveCache;
    } catch (error) {
      console.warn('Failed to get bonding curve addresses:', error);
      return this.bondingCurveCache; // Return cached version on error
    }
  }

  /**
   * Get creation statistics
   */
  getStats(): {
    isRunning: boolean;
    totalTokensTracked: number;
    recentCreations: number;
  } {
    return {
      isRunning: this.isRunning,
      totalTokensTracked: 0, // Would need to query database
      recentCreations: 0 // Would need to query recent creations
    };
  }
}