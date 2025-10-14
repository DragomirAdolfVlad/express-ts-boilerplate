import Redis from 'ioredis';
import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Configuration for the Scaling Coordinator
 */
export interface ScalingConfig {
  /** Redis connection configuration */
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  /** Unique identifier for this node */
  nodeId: string;
  /** Stream name for event distribution */
  streamName: string;
  /** Consumer group name */
  consumerGroup: string;
  /** Number of virtual nodes for consistent hashing */
  virtualNodes?: number;
  /** Leader election timeout in ms */
  leaderTimeout?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Rebalance delay in ms */
  rebalanceDelay?: number;
}

/**
 * Decoded event structure for distribution
 */
export interface DecodedEvent {
  tokenAddress: string;
  eventType: 'CurveBuy' | 'CurveSell' | 'CurveCreate';
  data: any;
  blockNumber: string;
  transactionHash: string;
  timestamp: number;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: DecodedEvent) => Promise<void>;

/**
 * Cluster statistics
 */
export interface ClusterStats {
  activeNodes: number;
  totalThroughput: number;
  partitionDistribution: Map<string, number>;
  isLeader: boolean;
  nodeId: string;
  uptime: number;
}

/**
 * Node information
 */
interface NodeInfo {
  nodeId: string;
  lastHeartbeat: number;
  throughput: number;
  partitions: string[];
}

/**
 * Horizontal Scaling Coordinator
 * 
 * Implements distributed event processing with:
 * - Redis Streams for message queue
 * - Consistent hashing for partition assignment
 * - Distributed locks for coordination
 * - Leader election for cluster management
 * - Automatic rebalancing on node changes
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
export class ScalingCoordinator extends EventEmitter {
  private redis: Redis;
  private pubSubRedis: Redis;
  private config: Required<ScalingConfig>;
  private eventHandler?: EventHandler;
  private isRunning = false;
  private isLeader = false;
  private startTime = Date.now();
  
  // Consistent hashing ring
  private hashRing: Map<number, string> = new Map();
  private nodePartitions: Map<string, Set<string>> = new Map();
  
  // Node tracking
  private activeNodes: Map<string, NodeInfo> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;
  private leaderElectionTimer?: NodeJS.Timeout;
  private rebalanceTimer?: NodeJS.Timeout;
  
  // Metrics
  private eventsProcessed = 0;
  private lastThroughputCheck = Date.now();
  private throughput = 0;
  
  // Lock keys
  private readonly LEADER_LOCK_KEY = 'scaling:leader:lock';
  private readonly NODES_KEY = 'scaling:nodes';
  private readonly PARTITIONS_KEY = 'scaling:partitions';

  constructor(config: ScalingConfig) {
    super();
    
    // Set defaults
    this.config = {
      ...config,
      virtualNodes: config.virtualNodes ?? 150,
      leaderTimeout: config.leaderTimeout ?? 10000,
      heartbeatInterval: config.heartbeatInterval ?? 3000,
      rebalanceDelay: config.rebalanceDelay ?? 5000,
    };

    // Initialize Redis connections
    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db ?? 0,
      keyPrefix: this.config.redis.keyPrefix ?? 'scaling:',
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Separate connection for pub/sub
    this.pubSubRedis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db ?? 0,
      keyPrefix: this.config.redis.keyPrefix ?? 'scaling:',
    });

    this.setupErrorHandlers();
  }

  /**
   * Initialize the coordinator
   * Requirement 10.1: Message queue support
   */
  async initialize(): Promise<void> {
    try {
      // Create consumer group if it doesn't exist
      try {
        await this.redis.xgroup(
          'CREATE',
          this.config.streamName,
          this.config.consumerGroup,
          '0',
          'MKSTREAM'
        );
      } catch (error: any) {
        // Group already exists, ignore
        if (!error.message.includes('BUSYGROUP')) {
          throw error;
        }
      }

      // Register this node
      await this.registerNode();

      // Start heartbeat
      this.startHeartbeat();

      // Attempt leader election
      await this.attemptLeaderElection();

      // Subscribe to cluster events
      await this.subscribeToClusterEvents();

      this.isRunning = true;
      this.emit('initialized', { nodeId: this.config.nodeId });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Publish event to the message queue
   * Requirement 10.1: Message queue distribution
   */
  async publishEvent(event: DecodedEvent): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Coordinator not initialized');
    }

    try {
      // Serialize event
      const eventData = {
        tokenAddress: event.tokenAddress,
        eventType: event.eventType,
        data: JSON.stringify(event.data),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: event.timestamp.toString(),
        publishedBy: this.config.nodeId,
        publishedAt: Date.now().toString(),
      };

      // Add to Redis Stream
      await this.redis.xadd(
        this.config.streamName,
        '*',
        ...Object.entries(eventData).flat()
      );

      this.emit('eventPublished', { event });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Subscribe to events from the message queue
   * Requirement 10.2: Consistent hashing for partition assignment
   */
  async subscribeEvents(handler: EventHandler): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Coordinator not initialized');
    }

    this.eventHandler = handler;

    // Start consuming from stream
    this.consumeStream();
  }

  /**
   * Get cluster statistics
   */
  getClusterStats(): ClusterStats {
    const partitionDistribution = new Map<string, number>();
    
    for (const [nodeId, partitions] of this.nodePartitions.entries()) {
      partitionDistribution.set(nodeId, partitions.size);
    }

    return {
      activeNodes: this.activeNodes.size,
      totalThroughput: Array.from(this.activeNodes.values())
        .reduce((sum, node) => sum + node.throughput, 0),
      partitionDistribution,
      isLeader: this.isLeader,
      nodeId: this.config.nodeId,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Gracefully shutdown the coordinator
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;

    // Clear timers
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.leaderElectionTimer) clearInterval(this.leaderElectionTimer);
    if (this.rebalanceTimer) clearTimeout(this.rebalanceTimer);

    // Unregister node
    await this.unregisterNode();

    // Release leader lock if held
    if (this.isLeader) {
      await this.releaseLeaderLock();
    }

    // Close Redis connections
    await this.redis.quit();
    await this.pubSubRedis.quit();

    this.emit('shutdown', { nodeId: this.config.nodeId });
  }

  /**
   * Acquire distributed lock
   * Requirement 10.4: Distributed locks using Redis
   */
  async acquireLock(lockKey: string, ttl: number = 10000): Promise<boolean> {
    try {
      const result = await this.redis.set(
        lockKey,
        this.config.nodeId,
        'PX',
        ttl,
        'NX'
      );
      return result === 'OK';
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Release distributed lock
   * Requirement 10.4: Distributed locks using Redis
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(script, 1, lockKey, this.config.nodeId);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Register this node in the cluster
   */
  private async registerNode(): Promise<void> {
    const nodeInfo: NodeInfo = {
      nodeId: this.config.nodeId,
      lastHeartbeat: Date.now(),
      throughput: 0,
      partitions: [],
    };

    await this.redis.hset(
      this.NODES_KEY,
      this.config.nodeId,
      JSON.stringify(nodeInfo)
    );

    this.activeNodes.set(this.config.nodeId, nodeInfo);
    this.emit('nodeRegistered', { nodeId: this.config.nodeId });
  }

  /**
   * Unregister this node from the cluster
   */
  private async unregisterNode(): Promise<void> {
    await this.redis.hdel(this.NODES_KEY, this.config.nodeId);
    this.activeNodes.delete(this.config.nodeId);
    
    // Publish node removal event
    await this.pubSubRedis.publish(
      'cluster:events',
      JSON.stringify({ type: 'node:removed', nodeId: this.config.nodeId })
    );
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        // Update throughput
        const now = Date.now();
        const elapsed = (now - this.lastThroughputCheck) / 1000;
        this.throughput = Math.round(this.eventsProcessed / elapsed);
        this.eventsProcessed = 0;
        this.lastThroughputCheck = now;

        // Update node info
        const nodeInfo: NodeInfo = {
          nodeId: this.config.nodeId,
          lastHeartbeat: now,
          throughput: this.throughput,
          partitions: Array.from(this.nodePartitions.get(this.config.nodeId) || []),
        };

        await this.redis.hset(
          this.NODES_KEY,
          this.config.nodeId,
          JSON.stringify(nodeInfo)
        );

        // Check for dead nodes (leader responsibility)
        if (this.isLeader) {
          await this.checkNodeHealth();
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Attempt to become the cluster leader
   * Requirement 10.5: Leader election
   */
  private async attemptLeaderElection(): Promise<void> {
    const acquired = await this.acquireLock(
      this.LEADER_LOCK_KEY,
      this.config.leaderTimeout
    );

    if (acquired) {
      this.isLeader = true;
      this.emit('becameLeader', { nodeId: this.config.nodeId });

      // Perform initial rebalancing
      await this.rebalancePartitions();

      // Renew leader lock periodically
      this.leaderElectionTimer = setInterval(async () => {
        const renewed = await this.acquireLock(
          this.LEADER_LOCK_KEY,
          this.config.leaderTimeout
        );

        if (!renewed) {
          this.isLeader = false;
          this.emit('lostLeadership', { nodeId: this.config.nodeId });
          clearInterval(this.leaderElectionTimer!);
          
          // Try to become leader again
          setTimeout(() => this.attemptLeaderElection(), 1000);
        }
      }, this.config.leaderTimeout / 2);
    } else {
      // Not leader, try again later
      setTimeout(() => this.attemptLeaderElection(), this.config.leaderTimeout);
    }
  }

  /**
   * Release leader lock
   */
  private async releaseLeaderLock(): Promise<void> {
    await this.releaseLock(this.LEADER_LOCK_KEY);
    this.isLeader = false;
  }

  /**
   * Check health of all nodes and remove dead ones
   * Requirement 10.7: Automatic failover
   */
  private async checkNodeHealth(): Promise<void> {
    try {
      const nodesData = await this.redis.hgetall(this.NODES_KEY);
      const now = Date.now();
      const deadNodes: string[] = [];

      for (const [nodeId, data] of Object.entries(nodesData)) {
        const nodeInfo: NodeInfo = JSON.parse(data);
        
        // Node is dead if no heartbeat for 3x heartbeat interval
        if (now - nodeInfo.lastHeartbeat > this.config.heartbeatInterval * 3) {
          deadNodes.push(nodeId);
        } else {
          this.activeNodes.set(nodeId, nodeInfo);
        }
      }

      // Remove dead nodes
      if (deadNodes.length > 0) {
        await this.redis.hdel(this.NODES_KEY, ...deadNodes);
        
        for (const nodeId of deadNodes) {
          this.activeNodes.delete(nodeId);
          this.emit('nodeRemoved', { nodeId, reason: 'timeout' });
        }

        // Trigger rebalancing
        await this.scheduleRebalance();
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Build consistent hash ring
   * Requirement 10.2: Consistent hashing for partition assignment
   */
  private buildHashRing(): void {
    this.hashRing.clear();
    this.nodePartitions.clear();

    const nodes = Array.from(this.activeNodes.keys());

    // Create virtual nodes for each physical node
    for (const nodeId of nodes) {
      this.nodePartitions.set(nodeId, new Set());
      
      for (let i = 0; i < this.config.virtualNodes; i++) {
        const virtualNodeKey = `${nodeId}:${i}`;
        const hash = this.hash(virtualNodeKey);
        this.hashRing.set(hash, nodeId);
      }
    }

    // Sort hash ring by hash value
    const sortedHashes = Array.from(this.hashRing.keys()).sort((a, b) => a - b);
    const sortedRing = new Map<number, string>();
    for (const hash of sortedHashes) {
      sortedRing.set(hash, this.hashRing.get(hash)!);
    }
    this.hashRing = sortedRing;
  }

  /**
   * Get node responsible for a token address using consistent hashing
   * Requirement 10.2: Consistent hashing
   */
  private getNodeForToken(tokenAddress: string): string {
    if (this.hashRing.size === 0) {
      return this.config.nodeId;
    }

    const tokenHash = this.hash(tokenAddress);
    
    // Find first node with hash >= tokenHash
    for (const [hash, nodeId] of this.hashRing.entries()) {
      if (hash >= tokenHash) {
        return nodeId;
      }
    }

    // Wrap around to first node
    return this.hashRing.values().next().value || '';
  }

  /**
   * Hash function for consistent hashing
   */
  private hash(key: string): number {
    const hash = crypto.createHash('md5').update(key).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Rebalance partitions across nodes
   * Requirement 10.3: Automatic rebalancing
   */
  private async rebalancePartitions(): Promise<void> {
    if (!this.isLeader) return;

    try {
      this.emit('rebalanceStarted');

      // Rebuild hash ring with current nodes
      this.buildHashRing();

      // Save partition assignments
      const assignments: Record<string, string[]> = {};
      for (const [nodeId, partitions] of this.nodePartitions.entries()) {
        assignments[nodeId] = Array.from(partitions);
      }

      await this.redis.set(
        this.PARTITIONS_KEY,
        JSON.stringify(assignments),
        'EX',
        300 // 5 minute expiry
      );

      // Publish rebalance event
      await this.pubSubRedis.publish(
        'cluster:events',
        JSON.stringify({ type: 'rebalance', assignments })
      );

      this.emit('rebalanceCompleted', { assignments });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Schedule a rebalance with delay to avoid thrashing
   * Requirement 10.3: Automatic rebalancing without downtime
   */
  private async scheduleRebalance(): Promise<void> {
    if (this.rebalanceTimer) {
      clearTimeout(this.rebalanceTimer);
    }

    this.rebalanceTimer = setTimeout(async () => {
      await this.rebalancePartitions();
    }, this.config.rebalanceDelay);
  }

  /**
   * Subscribe to cluster events
   */
  private async subscribeToClusterEvents(): Promise<void> {
    await this.pubSubRedis.subscribe('cluster:events');

    this.pubSubRedis.on('message', async (channel, message) => {
      if (channel === 'cluster:events') {
        try {
          const event = JSON.parse(message);

          switch (event.type) {
            case 'rebalance':
              // Update local partition assignments
              if (event.assignments[this.config.nodeId]) {
                this.nodePartitions.set(
                  this.config.nodeId,
                  new Set(event.assignments[this.config.nodeId])
                );
              }
              this.emit('partitionsAssigned', {
                partitions: event.assignments[this.config.nodeId] || [],
              });
              break;

            case 'node:added':
              if (this.isLeader && event.nodeId !== this.config.nodeId) {
                await this.scheduleRebalance();
              }
              break;

            case 'node:removed':
              if (this.isLeader && event.nodeId !== this.config.nodeId) {
                await this.scheduleRebalance();
              }
              break;
          }
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
  }

  /**
   * Consume events from Redis Stream
   * Requirement 10.2: Partition work by token address
   */
  private async consumeStream(): Promise<void> {
    const consumerId = this.config.nodeId;
    let lastId = '>';

    while (this.isRunning) {
      try {
        const results = await this.redis.xreadgroup(
          'GROUP',
          this.config.consumerGroup,
          consumerId,
          'COUNT',
          100,
          'BLOCK',
          1000,
          'STREAMS',
          this.config.streamName,
          lastId
        ) as any;

        if (!results || results.length === 0) {
          continue;
        }

        for (const [_stream, messages] of results as any) {
          for (const [messageId, fields] of messages) {
            try {
              // Parse event
              const eventData: any = {};
              for (let i = 0; i < fields.length; i += 2) {
                eventData[fields[i]] = fields[i + 1];
              }

              const event: DecodedEvent = {
                tokenAddress: eventData.tokenAddress,
                eventType: eventData.eventType,
                data: JSON.parse(eventData.data),
                blockNumber: eventData.blockNumber,
                transactionHash: eventData.transactionHash,
                timestamp: parseInt(eventData.timestamp),
              };

              // Check if this node should process this event
              const assignedNode = this.getNodeForToken(event.tokenAddress);
              
              if (assignedNode === this.config.nodeId) {
                // Process event
                if (this.eventHandler) {
                  await this.eventHandler(event);
                  this.eventsProcessed++;
                }

                // Acknowledge message
                await this.redis.xack(
                  this.config.streamName,
                  this.config.consumerGroup,
                  messageId
                );
              } else {
                // Not our partition, acknowledge without processing
                await this.redis.xack(
                  this.config.streamName,
                  this.config.consumerGroup,
                  messageId
                );
              }
            } catch (error) {
              this.emit('error', error);
              // Don't acknowledge failed messages - they'll be retried
            }
          }
        }
      } catch (error) {
        this.emit('error', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Setup error handlers for Redis connections
   */
  private setupErrorHandlers(): void {
    this.redis.on('error', (error) => {
      this.emit('error', { source: 'redis', error });
    });

    this.pubSubRedis.on('error', (error) => {
      this.emit('error', { source: 'pubsub', error });
    });
  }
}
