/**
 * Tracker Service Module Exports
 * 
 * Clean public API following Information Hiding Principle
 */

export { ITrackerService, IBlockchainTracker, ITrackerMetrics, ITrackerHealthStatus } from './interfaces';
export { TrackerService } from './tracker.service';
export { TrackerFactory } from './tracker-factory';

// Export singleton instance for convenience
import { TrackerService } from './tracker.service';
export const trackerService = new TrackerService();