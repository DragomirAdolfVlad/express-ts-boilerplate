/**
 * RPC Endpoint Manager
 * 
 * Manages multiple RPC endpoints with:
 * - Load balancing (weighted round-robin)
 * - Health checks
 * - Automatic failover
 * - Retry with exponential backoff
 * 
 * Requirements: 11.4, 11.5
 */

import { JsonRpcProvider } from 'ethers';
import { EndpointStats, RpcEndpoint } from './OptimizedRpcLayer';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

interface EndpointHealth {
  endpoint: RpcEndpoint;
  provider: JsonRpcProvider;
  healthy: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastHealthCheck: Date;
  requestCount: number;
  failureCount: number;
  totalLatency: number;
}

export class RpcEndpointManager {
  private endpoints: Map<string, EndpointHealth>;
  private retryConfig: RetryConfig;
  
  constructor(endpoints: RpcEndpoint[], retryConfig: RetryConfig) {
    this.endpoints = new Map();
    this.retryConfig = retryConfig;
    
    // Initialize endpoints
    for (const endpoint of endpoints) {
      if (endpoint.type === 'http') {
        const provider = new JsonRpcProvider(endpoint.url);
        
        this.endpoints.set(endpoint.url, {
          endpoint,
          provider,
          healthy: true,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          lastHealthCheck: new Date(),
          requestCount: 0,
          failureCount: 0,
          totalLatency: 0
        });
      }
    }
  }
  
  /**
   * Initialize all endpoints
   */
  async initialize(): Promise<void> {
    // Perform initial health check
    await this.performHealthChecks();
  }
  
  /**
   * Get next healthy endpoint using weighted round-robin
   * Requirement 11.4: Load balancing across multiple RPC endpoints
   */
  private getNextEndpoint(): EndpointHealth | null {
    const healthyEndpoints = Array.from(this.endpoints.values())
      .filter(e => e.healthy)
      .sort((a, b) => b.endpoint.priority - a.endpoint.priority);
    
    if (healthyEndpoints.length === 0) {
      // No healthy endpoints, try any endpoint
      const allEndpoints = Array.from(this.endpoints.values());
      return allEndpoints.length > 0 ? (allEndpoints[0] || null) : null;
    }
    
    // Weighted round-robin selection
    const totalWeight = healthyEndpoints.reduce((sum, e) => sum + e.endpoint.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const endpoint of healthyEndpoints) {
      random -= endpoint.endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }
    
    return healthyEndpoints[0] || null;
  }
  
  /**
   * Execute operation with automatic failover
   * Requirement 11.5: Retry with different endpoints and exponential backoff
   */
  async executeWithFailover<T>(
    operation: (provider: JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    const attemptedEndpoints = new Set<string>();
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      const endpointHealth = this.getNextEndpoint();
      
      if (!endpointHealth) {
        throw new Error('No RPC endpoints available');
      }
      
      // Skip if already attempted
      if (attemptedEndpoints.has(endpointHealth.endpoint.url)) {
        // If we've tried all endpoints, break
        if (attemptedEndpoints.size >= this.endpoints.size) {
          break;
        }
        continue;
      }
      
      attemptedEndpoints.add(endpointHealth.endpoint.url);
      
      const startTime = process.hrtime.bigint();
      
      try {
        const result = await operation(endpointHealth.provider);
        
        // Update success stats
        const latency = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        this.recordSuccess(endpointHealth, latency);
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Update failure stats
        this.recordFailure(endpointHealth);
        
        // If this was the last attempt, throw
        if (attempt === this.retryConfig.maxAttempts - 1) {
          break;
        }
        
        // Wait before retry with exponential backoff
        const delay = this.calculateBackoff(attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError || new Error('All RPC endpoints failed');
  }
  
  /**
   * Record successful request
   */
  private recordSuccess(endpointHealth: EndpointHealth, latency: number): void {
    endpointHealth.requestCount++;
    endpointHealth.totalLatency += latency;
    endpointHealth.consecutiveSuccesses++;
    endpointHealth.consecutiveFailures = 0;
    
    // Mark as healthy if it was unhealthy
    if (!endpointHealth.healthy && endpointHealth.consecutiveSuccesses >= 3) {
      endpointHealth.healthy = true;
      console.log(`✅ Endpoint ${endpointHealth.endpoint.url} marked as healthy`);
    }
  }
  
  /**
   * Record failed request
   */
  private recordFailure(endpointHealth: EndpointHealth): void {
    endpointHealth.requestCount++;
    endpointHealth.failureCount++;
    endpointHealth.consecutiveFailures++;
    endpointHealth.consecutiveSuccesses = 0;
    
    // Mark as unhealthy if too many consecutive failures
    if (endpointHealth.healthy && endpointHealth.consecutiveFailures >= 3) {
      endpointHealth.healthy = false;
      console.warn(`⚠️  Endpoint ${endpointHealth.endpoint.url} marked as unhealthy`);
    }
  }
  
  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
      this.retryConfig.maxDelay
    );
    
    // Add jitter (50-100% of calculated delay)
    return delay * (0.5 + Math.random() * 0.5);
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Perform health checks on all endpoints
   * Requirement 11.4: Health checks and automatic failover
   */
  async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.endpoints.values()).map(
      async (endpointHealth) => {
        try {
          // Simple health check: get block number
          await endpointHealth.provider.getBlockNumber();
          
          endpointHealth.lastHealthCheck = new Date();
          endpointHealth.consecutiveSuccesses++;
          endpointHealth.consecutiveFailures = 0;
          
          // Mark as healthy if enough consecutive successes
          if (endpointHealth.consecutiveSuccesses >= 2) {
            endpointHealth.healthy = true;
          }
          
        } catch (error) {
          endpointHealth.lastHealthCheck = new Date();
          endpointHealth.consecutiveFailures++;
          endpointHealth.consecutiveSuccesses = 0;
          
          // Mark as unhealthy if too many consecutive failures
          if (endpointHealth.consecutiveFailures >= 3) {
            endpointHealth.healthy = false;
          }
        }
      }
    );
    
    await Promise.allSettled(healthCheckPromises);
  }
  
  /**
   * Get endpoint statistics
   */
  getEndpointStats(): Map<string, EndpointStats> {
    const stats = new Map<string, EndpointStats>();
    
    for (const [url, health] of this.endpoints) {
      stats.set(url, {
        url,
        healthy: health.healthy,
        requestCount: health.requestCount,
        failureCount: health.failureCount,
        averageLatency: health.requestCount > 0 
          ? health.totalLatency / health.requestCount 
          : 0,
        lastHealthCheck: health.lastHealthCheck
      });
    }
    
    return stats;
  }
  
  /**
   * Get all healthy endpoints
   */
  getHealthyEndpoints(): RpcEndpoint[] {
    return Array.from(this.endpoints.values())
      .filter(e => e.healthy)
      .map(e => e.endpoint);
  }
  
  /**
   * Manually mark endpoint as healthy/unhealthy
   */
  setEndpointHealth(url: string, healthy: boolean): void {
    const endpoint = this.endpoints.get(url);
    if (endpoint) {
      endpoint.healthy = healthy;
      endpoint.consecutiveFailures = healthy ? 0 : 3;
      endpoint.consecutiveSuccesses = healthy ? 3 : 0;
    }
  }
  
  /**
   * Shutdown all providers
   */
  async shutdown(): Promise<void> {
    for (const health of this.endpoints.values()) {
      health.provider.destroy();
    }
    this.endpoints.clear();
  }
}
