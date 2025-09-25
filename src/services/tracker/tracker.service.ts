/**
 * Tracker Service Implementation
 * 
 * Main service orchestrating multiple tracker instances
 * Follows Single Responsibility and Dependency Inversion Principles
 */

import { ITrackerService, IBlockchainTracker, ITrackerMetrics, ITrackerHealthStatus } from './interfaces';
import { TrackerFactory } from './tracker-factory';
import { TrackerConfig } from '../../types/tracker.interfaces';
import { createRequestLogger } from '../../utils/logger';

export class TrackerService implements ITrackerService {
  private readonly logger = createRequestLogger('tracker-service');
  private readonly trackerFactory = new TrackerFactory();
  private readonly trackers = new Map<string, IBlockchainTracker>();

  public async initialize(): Promise<void> {
    this.logger.info('[TrackerService] Initializing tracker service...');

    try {
      // Initialize Monad tracker if configured
      await this.initializeMonadTracker();
      
      this.logger.info('[TrackerService] All trackers initialized successfully', {
        trackerCount: this.trackers.size,
        trackerTypes: Array.from(this.trackers.keys())
      });
    } catch (error) {
      this.logger.error('[TrackerService] Failed to initialize trackers:', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public getAllMetrics(): Record<string, ITrackerMetrics> {
    const metrics: Record<string, ITrackerMetrics> = {};
    
    for (const [name, tracker] of this.trackers) {
      metrics[name] = tracker.getMetrics();
    }
    
    return metrics;
  }

  public getAllHealthStatus(): Record<string, ITrackerHealthStatus> {
    const healthStatus: Record<string, ITrackerHealthStatus> = {};
    
    for (const [name, tracker] of this.trackers) {
      healthStatus[name] = tracker.getHealthStatus();
    }
    
    return healthStatus;
  }

  public async shutdown(): Promise<void> {
    this.logger.info('[TrackerService] Shutting down tracker service...');

    const shutdownPromises = Array.from(this.trackers.values()).map(async (tracker) => {
      try {
        await tracker.stop();
      } catch (error) {
        this.logger.error('[TrackerService] Error stopping tracker:', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.all(shutdownPromises);
    this.trackers.clear();

    this.logger.info('[TrackerService] Tracker service shutdown complete');
  }

  // Specific tracker getters for backward compatibility
  public getMonadMetrics(): ITrackerMetrics {
    const tracker = this.trackers.get('monad');
    if (!tracker) {
      throw new Error('Monad tracker not initialized');
    }
    return tracker.getMetrics();
  }

  public isMonadConnected(): boolean {
    const tracker = this.trackers.get('monad');
    return tracker?.isConnected() ?? false;
  }

  public getMonadUptime(): number | null {
    const tracker = this.trackers.get('monad');
    return tracker?.getMetrics().uptime ?? null;
  }

  public getMonadHealthStatus(): ITrackerHealthStatus {
    const tracker = this.trackers.get('monad');
    if (!tracker) {
      return {
        status: 'disconnected',
        connected: false,
        uptime: null,
        lastError: 'Tracker not initialized'
      };
    }
    return tracker.getHealthStatus();
  }

  private async initializeMonadTracker(): Promise<void> {
    if (!this.hasMonadConfig()) {
      this.logger.warn('[TrackerService] Monad tracker configuration not found, skipping initialization');
      return;
    }

    try {
      const config: TrackerConfig = {
        wsUrl: process.env['MONAD_WS_URL']!,
        httpUrl: process.env['MONAD_HTTP_URL']!,
        contractAddress: process.env['CONTRACT_ADDRESS']!,
        redis: {
          url: process.env['REDIS_URL']!,
          channel: process.env['REDIS_CHANNEL'] || 'monad-events',
        },
        reconnect: {
          maxAttempts: Number(process.env['MAX_RECONNECT_ATTEMPTS']) || 10,
          baseDelay: Number(process.env['RECONNECT_BASE_DELAY']) || 1000,
          backoffFactor: Number(process.env['RECONNECT_BACKOFF_FACTOR']) || 2,
        },
      };

      const monadTracker = this.trackerFactory.createTracker('monad', config);
      await monadTracker.start();
      
      this.trackers.set('monad', monadTracker);
      this.logger.info('[TrackerService] Monad tracker initialized successfully');
    } catch (error) {
      this.logger.error('[TrackerService] Failed to initialize Monad tracker:', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - service should continue even if one tracker fails
    }
  }

  private hasMonadConfig(): boolean {
    return !!(
      process.env['MONAD_WS_URL'] &&
      process.env['MONAD_HTTP_URL'] &&
      process.env['CONTRACT_ADDRESS'] &&
      process.env['REDIS_URL']
    );
  }
}