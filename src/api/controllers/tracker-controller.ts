/**
 * Tracker Controller
 * 
 * Handles tracker-related API endpoints for monitoring and management.
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';

// Note: This controller needs to be updated to work with the new clean architecture
// For now, it returns mock data to prevent API errors

export class TrackerController extends BaseController {
  constructor() {
    super('TrackerController');
  }

  /**
   * Get tracker metrics
   */
  public getMetrics = async (_req: Request, res: Response): Promise<void> => {
    try {
      // TODO: Integrate with BlockchainTrackingService
      const mockMetrics = {
        monad: {
          isConnected: true,
          uptime: Date.now() - 1000 * 60 * 5, // 5 minutes
          eventsProcessed: 42,
          eventsSkipped: 0,
          reconnectAttempts: 0,
          lastEventTime: new Date()
        }
      };
      
      this.success(res, mockMetrics);
    } catch (error) {
      this.error(res, error instanceof Error ? error : new Error(String(error)));
    }
  };

  /**
   * Get tracker health status
   */
  public getHealth = async (_req: Request, res: Response): Promise<void> => {
    try {
      // TODO: Integrate with BlockchainTrackingService
      const mockHealthStatus = {
        monad: {
          status: 'healthy' as const,
          connected: true,
          uptime: Date.now() - 1000 * 60 * 5,
          lastEventTime: new Date()
        }
      };
      
      // Determine overall health
      const hasHealthyTracker = Object.values(mockHealthStatus).some(
        (status: any) => status.status === 'healthy'
      );
      const overall = hasHealthyTracker ? 'healthy' : 'degraded';

      this.success(res, {
        trackers: mockHealthStatus,
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
      // TODO: Integrate with BlockchainTrackingService
      const mockMetrics = {
        isConnected: true,
        uptime: Date.now() - 1000 * 60 * 5,
        eventsProcessed: 42,
        eventsSkipped: 0,
        reconnectAttempts: 0,
        lastEventTime: new Date(),
        health: {
          status: 'healthy' as const,
          connected: true,
          uptime: Date.now() - 1000 * 60 * 5
        }
      };
      
      this.success(res, mockMetrics);
    } catch (error) {
      this.error(res, error instanceof Error ? error : new Error(String(error)));
    }
  };
}