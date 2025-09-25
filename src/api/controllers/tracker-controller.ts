/**
 * Tracker Controller
 * 
 * Handles tracker-related API endpoints for monitoring and management.
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { trackerService } from '../../services/tracker';

export class TrackerController extends BaseController {
  constructor() {
    super('TrackerController');
  }

  /**
   * Get tracker metrics
   */
  public getMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const allMetrics = trackerService.getAllMetrics();
      this.success(res, allMetrics);
    } catch (error) {
      this.error(res, error instanceof Error ? error : new Error(String(error)));
    }
  };

  /**
   * Get tracker health status
   */
  public getHealth = async (_req: Request, res: Response): Promise<void> => {
    try {
      const allHealthStatus = trackerService.getAllHealthStatus();
      
      // Determine overall health
      const hasHealthyTracker = Object.values(allHealthStatus).some(
        status => status.status === 'healthy'
      );
      const overall = hasHealthyTracker ? 'healthy' : 'degraded';

      this.success(res, {
        trackers: allHealthStatus,
        overall
      });
    } catch (error) {
      this.error(res, error instanceof Error ? error : new Error(String(error)));
    }
  };

  /**
   * Get specific Monad tracker metrics (for backward compatibility)
   */
  public getMonadMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = trackerService.getMonadMetrics();
      const healthStatus = trackerService.getMonadHealthStatus();
      
      this.success(res, {
        ...metrics,
        health: healthStatus
      });
    } catch (error) {
      this.error(res, error instanceof Error ? error : new Error(String(error)));
    }
  };
}