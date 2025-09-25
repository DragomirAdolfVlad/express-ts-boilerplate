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
import { InMemoryEventRepository } from '../../infrastructure/database/in-memory-event.repository';

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

  constructor(private readonly config: BlockchainTrackingConfiguration) {}

  async initialize(): Promise<void> {
    if (this.orchestrator) {
      throw new Error('Blockchain tracking service is already initialized');
    }

    // Create dependencies
    const trackerFactory = new TrackerFactory();
    
    const eventPublisher = new RedisEventPublisherAdapter(
      this.config.redis.url,
      {
        channel: this.config.redis.channel,
        retryAttempts: 3
      }
    );
    
    const eventRepository = new InMemoryEventRepository();

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
  }

  async shutdown(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.stop();
      this.orchestrator = null;
    }
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
}