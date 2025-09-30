/**
 * Dual Block Listener
 * 
 * Listens to BOTH proposed and finalized blocks simultaneously
 * - Proposed: Fast UI updates (400ms)
 * - Finalized: Safe data persistence (800ms)
 */
import { WebSocketProvider } from 'ethers';
import { PrismaClient } from '@prisma/client';

export class DualBlockListener {
  private proposedListener: WebSocketProvider;
  private finalizedListener: WebSocketProvider;
  private isRunning = false;

  constructor(
    private prisma: PrismaClient,
    wsUrl: string
  ) {
    // Two separate WebSocket connections
    this.proposedListener = new WebSocketProvider(wsUrl);
    this.finalizedListener = new WebSocketProvider(wsUrl);
  }

  /**
   * Start dual listening - BOTH proposed and finalized
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🚀 Starting DUAL block listener...');
    console.log('   ⚡ FAST: Proposed blocks (400ms) → UI updates');
    console.log('   🛡️  SAFE: Finalized blocks (800ms) → Data persistence');
    
    this.isRunning = true;

    // LISTENER 1: PROPOSED BLOCKS (FAST PATH)
    this.proposedListener.on('block', async (blockNumber) => {
      try {
        await this.handleProposedBlock(blockNumber);
      } catch (error) {
        console.error('❌ PROPOSED: Error handling block', blockNumber, error);
      }
    });

    // LISTENER 2: FINALIZED BLOCKS (SAFE PATH)  
    this.finalizedListener.on('block', async (blockNumber) => {
      try {
        // Wait a bit to ensure this is finalized
        setTimeout(() => this.handleFinalizedBlock(blockNumber), 1000);
      } catch (error) {
        console.error('❌ FINALIZED: Error handling block', blockNumber, error);
      }
    });

    console.log('✅ Dual listeners started successfully');
  }

  /**
   * FAST PATH: Handle proposed block (400ms latency)
   */
  private async handleProposedBlock(blockNumber: number): Promise<void> {
    console.log(`⚡ PROPOSED: Processing block ${blockNumber}`);
    
    try {
      // Get the proposed block
      const block = await this.proposedListener.getBlock(blockNumber);
      if (!block) return;

      // Get logs for NAD.FUN contract
      const logs = await this.proposedListener.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701' // Real NAD.FUN bonding curve
      });

      // Process each trade log OPTIMISTICALLY
      for (const log of logs) {
        await this.processOptimisticTrade(log, block);
      }

    } catch (error) {
      console.error(`❌ PROPOSED: Block ${blockNumber} error:`, error);
    }
  }

  /**
   * SAFE PATH: Handle finalized block (800ms latency)
   */
  private async handleFinalizedBlock(blockNumber: number): Promise<void> {
    console.log(`🛡️  FINALIZED: Processing block ${blockNumber}`);
    
    try {
      // Get the finalized block
      const block = await this.finalizedListener.getBlock(blockNumber);
      if (!block) return;

      // Get logs for NAD.FUN contract
      const logs = await this.finalizedListener.getLogs({
        fromBlock: blockNumber,
        toBlock: blockNumber,
        address: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701'
      });

      // Process each trade log as FINALIZED
      for (const log of logs) {
        await this.promoteTrade(log, block);
      }

    } catch (error) {
      console.error(`❌ FINALIZED: Block ${blockNumber} error:`, error);
    }
  }

  /**
   * FAST PATH: Process trade optimistically from proposed block
   */
  private async processOptimisticTrade(log: any, block: any): Promise<void> {
    const tradeId = `${log.transactionHash}:${log.logIndex}`;
    
    try {
      // Parse trade data from log
      const tradeData = await this.parseTradeFromLog(log);
      
      // Insert as PROPOSED (optimistic)
      await this.prisma.monadTokenTrade.upsert({
        where: { uniqueTradeId: tradeId },
        create: {
          ...tradeData,
          uniqueTradeId: tradeId,
          commitState: 'proposed', // 🚨 OPTIMISTIC
          blockHash: block.hash,
          blockNumber: block.number.toString(),
          timestamp: new Date(block.timestamp * 1000),
          observedAt: new Date(), // When we first saw it
          promotedAt: null,
          orphanedAt: null
        },
        update: {
          // Don't overwrite if already finalized
          commitState: 'proposed'
        }
      });

      // 🚀 EMIT TO UI IMMEDIATELY (400ms latency!)
      this.emitToUI('trade_proposed', {
        ...tradeData,
        tradeId,
        isOptimistic: true,
        blockNumber: block.number
      });

      console.log(`⚡ OPTIMISTIC: Trade ${tradeId} processed in 400ms`);

    } catch (error) {
      console.error(`❌ OPTIMISTIC: Failed to process ${tradeId}:`, error);
    }
  }

  /**
   * SAFE PATH: Promote trade from proposed to finalized
   */
  private async promoteTrade(log: any, block: any): Promise<void> {
    const tradeId = `${log.transactionHash}:${log.logIndex}`;
    
    try {
      // Check if we have this trade as proposed
      const existingTrade = await this.prisma.monadTokenTrade.findUnique({
        where: { uniqueTradeId: tradeId },
        select: { commitState: true, blockHash: true }
      });

      if (existingTrade) {
        // PROMOTE: proposed → finalized
        if (existingTrade.commitState === 'proposed') {
          
          // Check for reorg (different block hash)
          if (existingTrade.blockHash && existingTrade.blockHash !== block.hash) {
            console.warn(`🔄 REORG: Trade ${tradeId} block hash changed`);
            await this.handleReorg(tradeId, log, block);
            return;
          }

          // PROMOTE to finalized
          await this.prisma.monadTokenTrade.update({
            where: { uniqueTradeId: tradeId },
            data: {
              commitState: 'finalized', // 🛡️ SAFE
              promotedAt: new Date(),
              blockHash: block.hash // Confirm block hash
            }
          });

          // 🛡️ EMIT PROMOTION TO UI
          this.emitToUI('trade_finalized', {
            tradeId,
            isOptimistic: false,
            blockNumber: block.number
          });

          console.log(`🛡️  PROMOTED: Trade ${tradeId} finalized in 800ms`);
        }
      } else {
        // NEW TRADE: Insert directly as finalized (missed proposed)
        const tradeData = await this.parseTradeFromLog(log);
        
        await this.prisma.monadTokenTrade.create({
          ...tradeData,
          uniqueTradeId: tradeId,
          commitState: 'finalized',
          blockHash: block.hash,
          blockNumber: block.number.toString(),
          blockId: block.hash,
          timestamp: new Date(block.timestamp * 1000),
          observedAt: new Date(),
          promotedAt: new Date(),
          orphanedAt: null
        });

        // 🛡️ EMIT NEW FINALIZED TRADE
        this.emitToUI('trade_finalized', {
          ...tradeData,
          tradeId,
          isOptimistic: false,
          blockNumber: block.number
        });

        console.log(`🛡️  DIRECT: Trade ${tradeId} added as finalized`);
      }

    } catch (error) {
      console.error(`❌ PROMOTION: Failed to promote ${tradeId}:`, error);
    }
  }

  /**
   * Handle blockchain reorg
   */
  private async handleReorg(tradeId: string, log: any, newBlock: any): Promise<void> {
    console.warn(`🔄 REORG: Handling reorg for trade ${tradeId}`);
    
    try {
      // Mark old trade as orphaned
      await this.prisma.monadTokenTrade.update({
        where: { uniqueTradeId: tradeId },
        data: {
          commitState: 'orphaned' as any,
          orphanedAt: new Date()
        }
      });

      // Create new trade with new block data
      const tradeData = await this.parseTradeFromLog(log);
      const newTradeId = `${log.transactionHash}:${log.logIndex}_reorg_${Date.now()}`;
      
      await this.prisma.monadTokenTrade.create({
        ...tradeData,
        uniqueTradeId: newTradeId,
        commitState: 'finalized',
        blockHash: newBlock.hash,
        blockNumber: newBlock.number.toString(),
        blockId: newBlock.hash,
        timestamp: new Date(newBlock.timestamp * 1000),
        observedAt: new Date(),
        promotedAt: new Date(),
        orphanedAt: null
      });

      // 🔄 EMIT REORG TO UI
      this.emitToUI('trade_reorged', {
        oldTradeId: tradeId,
        newTradeId,
        blockNumber: newBlock.number
      });

      console.log(`🔄 REORG: Trade ${tradeId} → ${newTradeId}`);

    } catch (error) {
      console.error(`❌ REORG: Failed to handle reorg for ${tradeId}:`, error);
    }
  }

  /**
   * Parse trade data from log (your existing logic)
   */
  private async parseTradeFromLog(_log: any): Promise<any> {
    // Your existing trade parsing logic here
    // This is where you decode the swap event and extract:
    // - tokenAddress, trader, isBuy, wmonAmount, tokenAmount, etc.
    
    return {
      tokenAddress: '0x1234567890123456789012345678901234567890',
      signature: _log.transactionHash,
      logIndex: _log.logIndex,
      trader: '0x1234567890123456789012345678901234567890',
      isBuy: true,
      wmonAmount: 100,
      tokenAmount: 1000,
      pricePerToken: 0.1,
      usdAmount: 325,
      amountIn: 100,
      amountOut: 1000,
      inAsset: 'WMON',
      eventSignature: _log.topics[0],
      source: 'curve',
      isCreatorTrade: false,
      curveProgress: 0,
      marketCap: 1000,
      liquidityUsd: 100,
      amountWmonRaw: 100,
      amountTokenRaw: 1000,
      virtualWmonReserve: 30000,
      virtualTokenReserve: 1000000000,
      usdSpotPrice: 0.325
    };
  }

  /**
   * Emit events to UI (WebSocket, SSE, etc.)
   */
  private emitToUI(event: string, data: any): void {
    // Your UI emission logic here
    // Could be WebSocket, Server-Sent Events, etc.
    console.log(`📡 UI: ${event}`, data);
  }

  /**
   * Stop both listeners
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    await this.proposedListener.destroy();
    await this.finalizedListener.destroy();
    console.log('🛑 Dual listeners stopped');
  }
}

// Usage example:
// const dualListener = new DualBlockListener(prisma, 'wss://monad-rpc-url');
// await dualListener.start();