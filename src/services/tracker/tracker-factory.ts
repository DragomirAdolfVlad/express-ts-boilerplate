/**
 * Tracker Factory Implementation
 * 
 * Factory for creating tracker instances following Factory Pattern
 * Implements Dependency Inversion Principle
 */

import { ITrackerFactory, IBlockchainTracker } from './interfaces';
import { MonadTracker } from './monad-tracker';
import { TrackerConfig } from '../../types/tracker.interfaces';

export class TrackerFactory implements ITrackerFactory {
  public createTracker(type: string, config: any): IBlockchainTracker {
    switch (type.toLowerCase()) {
      case 'monad':
        if (!this.isValidMonadConfig(config)) {
          throw new Error('Invalid Monad tracker configuration');
        }
        return new MonadTracker(config as TrackerConfig);
        
      default:
        throw new Error(`Unsupported tracker type: ${type}`);
    }
  }

  private isValidMonadConfig(config: any): config is TrackerConfig {
    return (
      config &&
      typeof config.wsUrl === 'string' &&
      typeof config.httpUrl === 'string' &&
      typeof config.contractAddress === 'string' &&
      config.redis &&
      typeof config.redis.url === 'string' &&
      typeof config.redis.channel === 'string'
    );
  }
}