/**
 * Blockchain Tracking Service
 * 
 * Main application service for blockchain event tracking.
 * Orchestrates all tracking operations following clean architecture.
 */

import { TrackerOrchestratorService, TrackerOrchestratorConfiguration } from './tracker-orchestrator.service';
import { TrackerConfiguration } from '../interfaces/blockchain-tracker.interface';

import { TrackerFactory } from '../../infrastructure/factories/tracker.factory';
import { RedisEventPublisherAdapter } from '../../infrastructure/messaging/redis-event-publisher.adapter';
import { MonadTokenRepositoryImpl } from '../../infrastructure/database/monad-token.repository';
import { DatabaseCleanupService } from './database-cleanup.service';
import { PrismaClient } from '@prisma/client';

export interface BlockchainTrackingConfiguration {
  readonly monad: {
    readonly wsUrl: string;
    readonly httpUrl: string;
    readonly contractAddress: string;
    readonly reconnection: {
      readonly maxAttempts: number;
      readonly baseDelay: number;
      readonly backoffFactor: number;
    };
  };
  readonly redis: {
    readonly url: string;
    readonly channel: string;
  };
  readonly features: {
    readonly enablePersistence: boolean;
    readonly enablePublishing: boolean;
  };
}

export class BlockchainTrackingService {
  private orchestrator: TrackerOrchestratorService | null = null;
  private prisma: PrismaClient;
  private tokenRepository: MonadTokenRepositoryImpl;
  private cleanupService: DatabaseCleanupService;

  constructor(private readonly config: BlockchainTrackingConfiguration) {
    // Initialize database connection
    this.prisma = new PrismaClient();
    this.tokenRepository = new MonadTokenRepositoryImpl(this.prisma);
    this.cleanupService = new DatabaseCleanupService(this.tokenRepository, true);
  }

  async initialize(): Promise<void> {
    if (this.orchestrator) {
      throw new Error('Blockchain tracking service is already initialized');
    }

    // Create dependencies with repository injection
    const trackerFactory = new TrackerFactory(this.tokenRepository);
    
    const eventPublisher = new RedisEventPublisherAdapter(
      this.config.redis.url,
      {
        channel: this.config.redis.channel,
        retryAttempts: 3
      }
    );
    
    // Use the real PostgreSQL repository (cast to match interface)
    const eventRepository = this.tokenRepository as any;

    // Configure trackers
    const trackers = new Map<string, TrackerConfiguration>();
    trackers.set('monad', {
      wsUrl: this.config.monad.wsUrl,
      httpUrl: this.config.monad.httpUrl,
      contractAddress: this.config.monad.contractAddress,
      reconnection: this.config.monad.reconnection
    });

    // Create orchestrator configuration
    const orchestratorConfig: TrackerOrchestratorConfiguration = {
      trackers,
      enablePersistence: this.config.features.enablePersistence,
      enablePublishing: this.config.features.enablePublishing
    };

    // Create and start orchestrator
    this.orchestrator = new TrackerOrchestratorService(
      trackerFactory,
      eventPublisher,
      eventRepository,
      orchestratorConfig
    );

    await this.orchestrator.start();

    // Start the database cleanup service
    this.cleanupService.start();
    console.log('🧹 Database cleanup service started');
  }

  async shutdown(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.stop();
      this.orchestrator = null;
    }

    // Stop cleanup service and disconnect database
    this.cleanupService.stop();
    await this.prisma.$disconnect();
    console.log('🧹 Database cleanup service stopped');
  }

  getMetrics(): Record<string, any> {
    if (!this.orchestrator) {
      throw new Error('Service not initialized');
    }
    return this.orchestrator.getTrackerMetrics();
  }

  getHealthStatus(): Record<string, any> {
    if (!this.orchestrator) {
      return { status: 'not_initialized' };
    }
    return this.orchestrator.getHealthStatus();
  }

  isInitialized(): boolean {
    return this.orchestrator !== null;
  }

  /**
   * Get database cleanup metrics
   */
  getCleanupMetrics(): any {
    return this.cleanupService.getMetrics();
  }

  /**
   * Get cleanup service status
   */
  getCleanupStatus(): any {
    return this.cleanupService.getStatus();
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<any> {
    return this.cleanupService.runCleanup();
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    return this.cleanupService.getDatabaseStats();
  }

  /**
   * Get token repository for direct database operations
   */
  getTokenRepository(): MonadTokenRepositoryImpl {
    return this.tokenRepository;
  }
}