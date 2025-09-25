/**
 * Monad Blockchain Tracker Adapter
 * 
 * Infrastructure adapter for Monad blockchain tracking.
 * Implements the IBlockchainTracker interface.
 */

import WebSocket from 'ws';
import { IBlockchainTracker, TrackerConfiguration, TrackerMetrics, TrackerHealthStatus } from '../../application/interfaces/blockchain-tracker.interface';
import { IEventDecoderService, RawBlockchainLog } from '../../domain/services/event-decoder.service';
import { BlockchainEvent, EventPhase } from '../../domain/entities/blockchain-event.entity';
import { MonadTokenProcessorService } from '../../application/services/monad-token-processor.service';
import { WmonPriceProviderAdapter } from '../pricing/wmon-price-provider.adapter';
import { MonadTokenRepository } from '../database/monad-token.repository';
import {
  CurveTradeEvent,
  CurveTokenEvent,
  CurvePairEvent
} from '../../domain/entities/curve-events.entity';

export class MonadTrackerAdapter implements IBlockchainTracker {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  private eventCallback: ((event: BlockchainEvent) => Promise<void>) | null = null;
  private tokenProcessor: MonadTokenProcessorService;
  private wmonPriceProvider: WmonPriceProviderAdapter;
  private tokenRepository: MonadTokenRepository | null = null;

  private readonly metrics = {
    isConnected: false,
    uptime: null as number | null,
    eventsProcessed: 0,
    eventsSkipped: 0,
    reconnectAttempts: 0,
    lastEventTime: undefined as Date | undefined,
    lastError: undefined as string | undefined
  };

  private startTime: Date | null = null;
  private reconnectAttempts = 0;

  constructor(
    private readonly config: TrackerConfiguration,
    private readonly eventDecoder: IEventDecoderService
  ) {
    // Initialize token processing services
    this.wmonPriceProvider = new WmonPriceProviderAdapter();
    this.tokenProcessor = new MonadTokenProcessorService(this.wmonPriceProvider);
  }

  async start(): Promise<void> {
    if (this.metrics.isConnected) {
      throw new Error('Tracker is already running');
    }

    this.startTime = new Date();
    await this.connect();
  }

  async stop(): Promise<void> {
    this.cleanup();
    this.metrics.isConnected = false;
    this.startTime = null;
  }

  isConnected(): boolean {
    return this.metrics.isConnected;
  }

  getMetrics(): TrackerMetrics {
    return {
      ...this.metrics,
      uptime: this.calculateUptime()
    };
  }

  getHealthStatus(): TrackerHealthStatus {
    let status: TrackerHealthStatus['status'] = 'healthy';

    if (!this.metrics.isConnected) {
      status = 'disconnected';
    } else if (this.metrics.lastError) {
      status = 'unhealthy';
    }

    return {
      status,
      connected: this.metrics.isConnected,
      uptime: this.calculateUptime(),
      lastError: this.metrics.lastError,
      lastEventTime: this.metrics.lastEventTime
    };
  }

  onEvent(callback: (event: BlockchainEvent) => Promise<void>): void {
    this.eventCallback = callback;
  }

  /**
   * Inject the token repository for database operations
   */
  setTokenRepository(repository: MonadTokenRepository): void {
    this.tokenRepository = repository;
    console.log('[🔗 INJECT] Token repository injected into tracker');
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.on('open', () => {
        this.metrics.isConnected = true;
        this.metrics.lastError = undefined;
        this.reconnectAttempts = 0;
        this.setupEventHandlers();
        this.startPingPong();
        this.subscribe().then(resolve).catch(reject);
      });

      this.ws.on('error', (error) => {
        this.metrics.lastError = error.message;
        reject(error);
      });
    });
  }

  private async subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const subscriptionMessage = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'eth_subscribe',
        params: [
          'monadLogs',
          {
            address: this.config.contractAddress
          }
        ]
      };

      const responseHandler = (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.id && message.result) {
            // Subscription established
            this.ws?.off('message', responseHandler);
            resolve();
          } else if (message.error) {
            this.metrics.lastError = message.error.message || 'Subscription failed';
            reject(new Error(this.metrics.lastError));
          }
        } catch (error) {
          reject(error);
        }
      };

      this.ws.on('message', responseHandler);
      this.ws.send(JSON.stringify(subscriptionMessage));

      // Timeout after 10 seconds
      setTimeout(() => {
        this.ws?.off('message', responseHandler);
        reject(new Error('Subscription timeout'));
      }, 10000);
    });
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('pong', () => {
      // Connection is alive
    });
  }

  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());

      // Only process subscription notifications
      if (message.method !== 'eth_subscription' || !message.params?.result) {
        return;
      }

      await this.processLog(message.params.result);

    } catch (error) {
      this.metrics.eventsSkipped++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async processLog(logData: any): Promise<void> {
    try {
      // Extract Monad-specific data and convert to standard format
      const { log: standardLog, phase } = this.extractMonadLogData(logData);

      const rawLog: RawBlockchainLog = {
        address: standardLog.address,
        topics: standardLog.topics,
        data: standardLog.data,
        blockNumber: standardLog.blockNumber,
        blockHash: standardLog.blockHash,
        transactionHash: standardLog.transactionHash,
        transactionIndex: standardLog.transactionIndex,
        logIndex: standardLog.logIndex,
        removed: standardLog.removed
      };

      const decodingResult = await this.eventDecoder.decode(rawLog, phase);

      if (decodingResult.success && decodingResult.event) {
        this.metrics.eventsProcessed++;
        this.metrics.lastEventTime = new Date();

        // Process the event for token/trade data
        await this.processTokenEvent(decodingResult.event, phase);

        if (this.eventCallback) {
          await this.eventCallback(decodingResult.event);
        }
      } else {
        this.metrics.eventsSkipped++;
        if (decodingResult.error) {
          this.metrics.lastError = decodingResult.error;
        }
      }
    } catch (error) {
      this.metrics.eventsSkipped++;
      this.metrics.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private mapCommitStateToPhase(commitState: string): string {
    switch (commitState) {
      case 'Proposed': return EventPhase.PROPOSED;
      case 'Voted': return EventPhase.VOTED;
      case 'Finalized': return EventPhase.FINALIZED;
      case 'Verified': return EventPhase.VERIFIED;
      default: return EventPhase.UNKNOWN;
    }
  }

  private extractMonadLogData(logData: any): { log: any; phase: string } {
    // Extract Monad-specific fields
    const commitState = logData.commitState || 'unknown';
    const blockId = logData.blockId;

    // Create standard Ethereum log format for decoder compatibility
    const standardLog = {
      address: logData.address,
      topics: logData.topics,
      data: logData.data,
      blockNumber: logData.blockNumber,
      blockHash: logData.blockHash,
      transactionHash: logData.transactionHash,
      transactionIndex: logData.transactionIndex,
      logIndex: logData.logIndex,
      removed: logData.removed || false,
      // Keep Monad-specific fields for reference
      monad: {
        blockId,
        commitState
      }
    };

    return {
      log: standardLog,
      phase: this.mapCommitStateToPhase(commitState)
    };
  }

  private handleError(error: Error): void {
    this.metrics.lastError = error.message;
    this.metrics.isConnected = false;
    this.attemptReconnect();
  }

  private handleClose(_code: number, _reason: Buffer): void {
    this.metrics.isConnected = false;
    this.stopPingPong();
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnection.maxAttempts) {
      this.metrics.lastError = 'Max reconnect attempts reached';
      return;
    }

    const delay = Math.min(
      this.config.reconnection.baseDelay * Math.pow(this.config.reconnection.backoffFactor, this.reconnectAttempts),
      this.config.reconnection.baseDelay * 10
    );

    this.reconnectAttempts++;
    this.metrics.reconnectAttempts = this.reconnectAttempts;

    setTimeout(() => {
      this.connect().catch(error => {
        this.metrics.lastError = error.message;
      });
    }, delay);
  }

  private startPingPong(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private cleanup(): void {
    this.stopPingPong();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }


  }

  private calculateUptime(): number | null {
    if (!this.startTime) return null;
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Process blockchain events for token/trade data
   * Focus on finalized events for confirmed transactions
   */
  private async processTokenEvent(event: BlockchainEvent, _phase: string): Promise<void> {
    try {
      // Only process finalized events for database persistence
      // const shouldProcess = this.tokenProcessor.shouldProcessEvent(phase, true);

      if (event instanceof CurveTokenEvent) {
        const result = await this.tokenProcessor.processTokenLaunch(event);

        if (result.shouldPersist) {
          console.log(`[💾 PERSIST] Token Launch: ${result.token.address} - ${result.reason}`);
          
          // Save to database
          try {
            await this.saveTokenToDatabase(result.token);
          } catch (error) {
            console.error(`[❌ DB] Failed to save token:`, error);
          }
        } else {
          console.log(`[⏳ SKIP] Token Launch: ${result.token.address} - ${result.reason}`);
        }
      }

      else if (event instanceof CurveTradeEvent) {
        const result = await this.tokenProcessor.processTrade(event);

        if (result.shouldPersist) {
          // Get price info for better logging
          const priceInfo = await this.tokenProcessor.getWmonPriceInfo();
          const usdValue = (Number(result.trade.wmonAmount) / 1e18) * priceInfo.price;

          console.log(`[� PEORSIST] ${result.trade.isBuy ? '🟢 BUY' : '🔴 SELL'} ${result.trade.tokenAddress.slice(0, 8)}...`);
          console.log(`  💰 Amount: ${(Number(result.trade.wmonAmount) / 1e18).toFixed(4)} WMON ($${usdValue.toFixed(2)})`);
          console.log(`  🪙 Tokens: ${(Number(result.trade.tokenAmount) / 1e18).toFixed(2)}`);
          console.log(`  📊 Price: $${priceInfo.price.toFixed(6)} WMON (±${((priceInfo.confidence / priceInfo.price) * 100).toFixed(1)}%)`);
          console.log(`  ⏰ ${result.reason}`);

          // Convert to pump.fun format for frontend compatibility
          const pumpFunFormat = await this.tokenProcessor.convertToPumpFunFormat(result.trade);
          console.log(`[📊 FRONTEND DATA]`, JSON.stringify(pumpFunFormat, null, 2));

          // Save to database
          try {
            await this.saveTradeToDatabase(result.trade);
          } catch (error) {
            console.error(`[❌ DB] Failed to save trade:`, error);
          }
        } else {
          console.log(`[⏳ SKIP] Trade: ${result.trade.tokenAddress} - ${result.reason}`);
        }
      }

      else if (event instanceof CurvePairEvent) {
        const result = await this.tokenProcessor.processPairEvent(event);

        if (result.shouldPersist) {
          console.log(`[💾 PERSIST] DEX Graduation: ${result.token.address} - ${result.reason}`);
          // TODO: Update token status in database
          // await this.tokenRepository.markAsGraduated(result.token);
        } else {
          console.log(`[⏳ SKIP] DEX Graduation: ${result.token.address} - ${result.reason}`);
        }
      }

    } catch (error) {
      console.error('[❌ TOKEN PROCESSING ERROR]', error);
    }
  }

  /**
   * Save token to database
   */
  private async saveTokenToDatabase(token: any): Promise<void> {
    if (!this.tokenRepository) {
      console.warn(`[⚠️ DB] No repository injected, skipping token save: ${token.address}`);
      return;
    }

    try {
      await this.tokenRepository.saveToken(token);
      console.log(`[💾 DB] Token saved: ${token.address}`);
    } catch (error) {
      console.error(`[❌ DB] Failed to save token ${token.address}:`, error);
      throw error;
    }
  }

  /**
   * Save trade to database
   */
  private async saveTradeToDatabase(trade: any): Promise<void> {
    if (!this.tokenRepository) {
      console.warn(`[⚠️ DB] No repository injected, skipping trade save: ${trade.tokenAddress}`);
      return;
    }

    try {
      await this.tokenRepository.saveTrade(trade);
      console.log(`[💾 DB] Trade saved: ${trade.tokenAddress} ${trade.isBuy ? 'BUY' : 'SELL'}`);
    } catch (error) {
      console.error(`[❌ DB] Failed to save trade ${trade.tokenAddress}:`, error);
      throw error;
    }
  }
}