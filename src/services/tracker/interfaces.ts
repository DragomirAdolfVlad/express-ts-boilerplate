/**
 * Tracker Service Interfaces
 * 
 * Defines contracts for tracker services following Interface Segregation Principle
 */

export interface ITrackerMetrics {
  messagesProcessed: number;
  messagesSkipped: number;
  reconnectAttempts: number;
  lastEventTime?: Date;
  uptime: number | null;
  isConnected: boolean;
}

export interface ITrackerHealthStatus {
  status: 'healthy' | 'unhealthy' | 'connecting' | 'disconnected';
  connected: boolean;
  uptime: number | null;
  lastError?: string;
  lastEventTime?: Date;
}

export interface IBlockchainTracker {
  /**
   * Start the tracker connection
   */
  start(): Promise<void>;
  
  /**
   * Stop the tracker and cleanup resources
   */
  stop(): Promise<void>;
  
  /**
   * Get current connection status
   */
  isConnected(): boolean;
  
  /**
   * Get tracker metrics
   */
  getMetrics(): ITrackerMetrics;
  
  /**
   * Get health status
   */
  getHealthStatus(): ITrackerHealthStatus;
}

export interface ITrackerService {
  /**
   * Initialize all tracker instances
   */
  initialize(): Promise<void>;
  
  /**
   * Get metrics for all trackers
   */
  getAllMetrics(): Record<string, ITrackerMetrics>;
  
  /**
   * Get health status for all trackers
   */
  getAllHealthStatus(): Record<string, ITrackerHealthStatus>;
  
  /**
   * Shutdown all trackers
   */
  shutdown(): Promise<void>;
}

export interface ITrackerFactory {
  /**
   * Create a blockchain tracker instance
   */
  createTracker(type: string, config: any): IBlockchainTracker;
}