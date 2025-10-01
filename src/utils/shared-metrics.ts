/**
 * Shared Metrics System - Uses file system to share metrics between processes
 */

import * as fs from 'fs';
import * as path from 'path';

const METRICS_FILE = path.join(process.cwd(), 'temp-metrics.json');

export interface SharedMetricsData {
  rpcCalls: Array<{
    method: string;
    latency: number;
    success: boolean;
    timestamp: number;
  }>;
  blockProcessing: Array<{
    blockNumber: number;
    latency: number;
    events: number;
    timestamp: number;
  }>;
  databaseOperations: Array<{
    operation: string;
    latency: number;
    success: boolean;
    timestamp: number;
  }>;
  lastUpdate: number;
}

class SharedMetricsManager {
  private static instance: SharedMetricsManager;
  // Removed unused writeQueue property
  // Removed unused writeTimer property

  static getInstance(): SharedMetricsManager {
    if (!SharedMetricsManager.instance) {
      SharedMetricsManager.instance = new SharedMetricsManager();
    }
    return SharedMetricsManager.instance;
  }

  private ensureMetricsFile() {
    if (!fs.existsSync(METRICS_FILE)) {
      const initialData: SharedMetricsData = {
        rpcCalls: [],
        blockProcessing: [],
        databaseOperations: [],
        lastUpdate: Date.now()
      };
      fs.writeFileSync(METRICS_FILE, JSON.stringify(initialData, null, 2));
    }
  }

  recordRPCCall(method: string, latency: number, success: boolean) {
    this.addToQueue('rpcCalls', {
      method,
      latency,
      success,
      timestamp: Date.now()
    });
  }

  recordBlockProcessing(blockNumber: number, latency: number, events: number) {
    this.addToQueue('blockProcessing', {
      blockNumber,
      latency,
      events,
      timestamp: Date.now()
    });
  }

  recordDatabaseOperation(operation: string, latency: number, success: boolean) {
    this.addToQueue('databaseOperations', {
      operation,
      latency,
      success,
      timestamp: Date.now()
    });
  }

  private addToQueue(type: 'rpcCalls' | 'blockProcessing' | 'databaseOperations', data: any) {
    try {
      this.ensureMetricsFile();
      
      // Read current data
      const currentData: SharedMetricsData = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      
      // Add new data
      currentData[type].push(data);
      
      // Keep only last entries based on type
      if (type === 'rpcCalls' && currentData.rpcCalls.length > 1000) {
        currentData.rpcCalls = currentData.rpcCalls.slice(-1000);
      } else if (type === 'blockProcessing' && currentData.blockProcessing.length > 100) {
        currentData.blockProcessing = currentData.blockProcessing.slice(-100);
      } else if (type === 'databaseOperations' && currentData.databaseOperations.length > 500) {
        currentData.databaseOperations = currentData.databaseOperations.slice(-500);
      }
      
      currentData.lastUpdate = Date.now();
      
      // Write immediately (for real-time updates)
      fs.writeFileSync(METRICS_FILE, JSON.stringify(currentData, null, 2));
      
    } catch (error) {
      console.error('Failed to write metrics:', error);
    }
  }

  readMetrics(): SharedMetricsData {
    try {
      this.ensureMetricsFile();
      return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
    } catch (error) {
      console.error('Failed to read metrics:', error);
      return {
        rpcCalls: [],
        blockProcessing: [],
        databaseOperations: [],
        lastUpdate: Date.now()
      };
    }
  }

  getRecentMetrics(timeWindowMs: number = 60000): SharedMetricsData {
    const allMetrics = this.readMetrics();
    const cutoff = Date.now() - timeWindowMs;
    
    return {
      rpcCalls: allMetrics.rpcCalls.filter(m => m.timestamp > cutoff),
      blockProcessing: allMetrics.blockProcessing.filter(m => m.timestamp > cutoff),
      databaseOperations: allMetrics.databaseOperations.filter(m => m.timestamp > cutoff),
      lastUpdate: allMetrics.lastUpdate
    };
  }

  clearMetrics() {
    try {
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }
    } catch (error) {
      console.error('Failed to clear metrics:', error);
    }
  }
}

export const sharedMetrics = SharedMetricsManager.getInstance();