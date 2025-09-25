/**
 * Tracker Orchestrator Service
 * 
 * Application service that orchestrates blockchain tracking.
 * Follows Single Responsibility and Dependency Inversion Principles.
 */

import { IBlockchainTracker, TrackerConfiguration } from '../interfaces/blockchain-tracker.interface';
import { IEventPublisher } from '../interfaces/event-publisher.interface';
import { IEventRepository } from '../../domain/repositories/event.repository';
import { BlockchainEvent } from '../../domain/entities/blockchain-event.entity';

export interface TrackerOrchestratorConfiguration {
  readonly trackers: Map<string, TrackerConfiguration>;
  readonly enablePersistence: boolean;
  readonly enablePublishing: boolean;
}

export class TrackerOrchestratorService {
  private readonly activeTrackers = new Map<string, IBlockchainTracker>();
  private isRunning = false;

  constructor(
    private readonly trackerFactory: ITrackerFactory,
    private readonly eventPublisher: IEventPublisher,
    private readonly eventRepository: IEventRepository,
    private readonly configuration: TrackerOrchestratorConfiguration
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Tracker orchestrator is already running');
    }

    try {
      // Initialize all configured trackers
      for (const [name, config] of this.configuration.trackers) {
        const tracker = this.trackerFactory.create(name, config);
        
        // Subscribe to events
        tracker.onEvent(async (event: BlockchainEvent) => {
          await this.handleEvent(event);
        });

        await tracker.start();
        this.activeTrackers.set(name, tracker);
      }

      this.isRunning = true;
    } catch (error) {
      // Cleanup on failure
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Stop all trackers
    const stopPromises = Array.from(this.activeTrackers.values()).map(
      tracker => tracker.stop().catch(error => {
        console.error('Error stopping tracker:', error);
      })
    );

    await Promise.all(stopPromises);
    this.activeTrackers.clear();

    // Close publisher
    await this.eventPublisher.close();
  }

  getTrackerMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [name, tracker] of this.activeTrackers) {
      metrics[name] = tracker.getMetrics();
    }
    
    return metrics;
  }

  getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, tracker] of this.activeTrackers) {
      status[name] = tracker.getHealthStatus();
    }
    
    return status;
  }

  private async handleEvent(event: BlockchainEvent): Promise<void> {
    const tasks: Promise<void>[] = [];

    // Persist event if enabled
    if (this.configuration.enablePersistence) {
      tasks.push(
        this.eventRepository.save(event).catch(error => {
          console.error('Failed to persist event:', error);
        })
      );
    }

    // Publish event if enabled
    if (this.configuration.enablePublishing) {
      tasks.push(
        this.eventPublisher.publish(event).then(result => {
          if (!result.success) {
            console.error('Failed to publish event:', result.error);
          }
        }).catch(error => {
          console.error('Failed to publish event:', error);
        })
      );
    }

    // Execute all tasks concurrently
    await Promise.all(tasks);
  }
}

export interface ITrackerFactory {
  create(type: string, config: TrackerConfiguration): IBlockchainTracker;
}