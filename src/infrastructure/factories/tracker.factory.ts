/**
 * Tracker Factory
 * 
 * Factory for creating blockchain tracker instances.
 * Implements Factory Pattern and Dependency Inversion Principle.
 */

import { IBlockchainTracker, TrackerConfiguration } from '../../application/interfaces/blockchain-tracker.interface';
import { ITrackerFactory } from '../../application/services/tracker-orchestrator.service';
import { MonadTrackerAdapter } from '../blockchain/monad-tracker.adapter';
import { CurveEventDecoderAdapter } from '../blockchain/curve-event-decoder.adapter';
import { MonadTokenRepository } from '../database/monad-token.repository';

export class TrackerFactory implements ITrackerFactory {
  constructor(private readonly tokenRepository?: MonadTokenRepository) {}

  create(type: string, config: TrackerConfiguration): IBlockchainTracker {
    switch (type.toLowerCase()) {
      case 'monad':
        return this.createMonadTracker(config);
        
      default:
        throw new Error(`Unsupported tracker type: ${type}`);
    }
  }

  private createMonadTracker(config: TrackerConfiguration): IBlockchainTracker {
    const eventDecoder = new CurveEventDecoderAdapter();
    const tracker = new MonadTrackerAdapter(config, eventDecoder);
    
    // Inject repository if available
    if (this.tokenRepository) {
      console.log('[🏭 FACTORY] Injecting repository into Monad tracker');
      tracker.setTokenRepository(this.tokenRepository);
    } else {
      console.warn('[⚠️ FACTORY] No repository available for injection');
    }
    
    return tracker;
  }
}