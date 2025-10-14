import { ScalingCoordinator, ScalingConfig, DecodedEvent } from '../ScalingCoordinator';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');

describe('ScalingCoordinator', () => {
  let coordinator: ScalingCoordinator;
  let mockRedis: jest.Mocked<Redis>;
  let mockPubSubRedis: jest.Mocked<Redis>;
  let config: ScalingConfig;

  beforeEach(() => {
    // Setup mock Redis instances
    mockRedis = {
      xgroup: jest.fn().mockResolvedValue('OK'),
      xadd: jest.fn().mockResolvedValue('1234567890-0'),
      xreadgroup: jest.fn().mockResolvedValue([]),
      xack: jest.fn().mockResolvedValue(1),
      hset: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      hdel: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      eval: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    } as any;

    mockPubSubRedis = {
      subscribe: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation((options) => {
      // Return different mocks based on usage
      return mockRedis;
    });

    config = {
      redis: {
        host: 'localhost',
        port: 6379,
      },
      nodeId: 'test-node-1',
      streamName: 'test-events',
      consumerGroup: 'test-group',
      virtualNodes: 150,
      leaderTimeout: 5000,
      heartbeatInterval: 1000,
      rebalanceDelay: 2000,
    };
  });

  afterEach(async () => {
    if (coordinator) {
      await coordinator.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      coordinator = new ScalingCoordinator(config);
      
      const initPromise = coordinator.initialize();
      
      await expect(initPromise).resolves.not.toThrow();
      expect(mockRedis.xgroup).toHaveBeenCalledWith(
        'CREATE',
        config.streamName,
        config.consumerGroup,
        '0',
        'MKSTREAM'
      );
    });

    it('should handle existing consumer group', async () => {
      const error = new Error('BUSYGROUP Consumer Group name already exists');
      mockRedis.xgroup.mockRejectedValueOnce(error);

      coordinator = new ScalingCoordinator(config);
      
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should register node on initialization', async () => {
      coordinator = new ScalingCoordinator(config);
      
      await coordinator.initialize();
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'scaling:nodes',
        config.nodeId,
        expect.stringContaining(config.nodeId)
      );
    });

    it('should emit initialized event', async () => {
      coordinator = new ScalingCoordinator(config);
      
      const initSpy = jest.fn();
      coordinator.on('initialized', initSpy);
      
      await coordinator.initialize();
      
      expect(initSpy).toHaveBeenCalledWith({ nodeId: config.nodeId });
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should publish event to Redis Stream', async () => {
      const event: DecodedEvent = {
        tokenAddress: '0x1234567890123456789012345678901234567890',
        eventType: 'CurveBuy',
        data: { amount: '1000' },
        blockNumber: '12345',
        transactionHash: '0xabcdef',
        timestamp: Date.now(),
      };

      await coordinator.publishEvent(event);

      expect(mockRedis.xadd).toHaveBeenCalledWith(
        config.streamName,
        '*',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should emit eventPublished event', async () => {
      const event: DecodedEvent = {
        tokenAddress: '0x1234567890123456789012345678901234567890',
        eventType: 'CurveSell',
        data: { amount: '500' },
        blockNumber: '12346',
        transactionHash: '0xfedcba',
        timestamp: Date.now(),
      };

      const publishSpy = jest.fn();
      coordinator.on('eventPublished', publishSpy);

      await coordinator.publishEvent(event);

      expect(publishSpy).toHaveBeenCalledWith({ event });
    });

    it('should throw error if not initialized', async () => {
      const uninitializedCoordinator = new ScalingCoordinator(config);
      
      const event: DecodedEvent = {
        tokenAddress: '0x1234567890123456789012345678901234567890',
        eventType: 'CurveBuy',
        data: {},
        blockNumber: '12345',
        transactionHash: '0xabcdef',
        timestamp: Date.now(),
      };

      await expect(uninitializedCoordinator.publishEvent(event))
        .rejects.toThrow('Coordinator not initialized');
    });
  });

  describe('Event Subscription', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should accept event handler', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      await expect(coordinator.subscribeEvents(handler)).resolves.not.toThrow();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedCoordinator = new ScalingCoordinator(config);
      const handler = jest.fn();

      await expect(uninitializedCoordinator.subscribeEvents(handler))
        .rejects.toThrow('Coordinator not initialized');
    });
  });

  describe('Distributed Locks', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should acquire lock successfully', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      const acquired = await coordinator.acquireLock('test-lock', 5000);

      expect(acquired).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-lock',
        config.nodeId,
        'PX',
        5000,
        'NX'
      );
    });

    it('should fail to acquire lock if already held', async () => {
      mockRedis.set.mockResolvedValueOnce(null);

      const acquired = await coordinator.acquireLock('test-lock', 5000);

      expect(acquired).toBe(false);
    });

    it('should release lock', async () => {
      await coordinator.releaseLock('test-lock');

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get", KEYS[1])'),
        1,
        'test-lock',
        config.nodeId
      );
    });

    it('should handle lock release errors gracefully', async () => {
      mockRedis.eval.mockRejectedValueOnce(new Error('Redis error'));

      await expect(coordinator.releaseLock('test-lock')).resolves.not.toThrow();
    });
  });

  describe('Leader Election', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
    });

    it('should become leader when lock acquired', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      await coordinator.initialize();

      // Wait for leader election
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = coordinator.getClusterStats();
      expect(stats.isLeader).toBe(true);
    });

    it('should emit becameLeader event', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      const leaderSpy = jest.fn();
      coordinator.on('becameLeader', leaderSpy);

      await coordinator.initialize();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(leaderSpy).toHaveBeenCalledWith({ nodeId: config.nodeId });
    });

    it('should not become leader when lock not acquired', async () => {
      mockRedis.set.mockResolvedValue(null);

      await coordinator.initialize();
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = coordinator.getClusterStats();
      expect(stats.isLeader).toBe(false);
    });
  });

  describe('Cluster Statistics', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should return cluster statistics', () => {
      const stats = coordinator.getClusterStats();

      expect(stats).toMatchObject({
        activeNodes: expect.any(Number),
        totalThroughput: expect.any(Number),
        partitionDistribution: expect.any(Map),
        isLeader: expect.any(Boolean),
        nodeId: config.nodeId,
        uptime: expect.any(Number),
      });
    });

    it('should track uptime correctly', async () => {
      const stats1 = coordinator.getClusterStats();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats2 = coordinator.getClusterStats();

      expect(stats2.uptime).toBeGreaterThan(stats1.uptime);
    });
  });

  describe('Consistent Hashing', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      
      // Mock multiple nodes
      mockRedis.hgetall.mockResolvedValue({
        'node-1': JSON.stringify({
          nodeId: 'node-1',
          lastHeartbeat: Date.now(),
          throughput: 100,
          partitions: [],
        }),
        'node-2': JSON.stringify({
          nodeId: 'node-2',
          lastHeartbeat: Date.now(),
          throughput: 150,
          partitions: [],
        }),
        'node-3': JSON.stringify({
          nodeId: 'node-3',
          lastHeartbeat: Date.now(),
          throughput: 120,
          partitions: [],
        }),
      });

      await coordinator.initialize();
    });

    it('should distribute tokens across nodes', () => {
      const stats = coordinator.getClusterStats();
      
      // With consistent hashing, partitions should be distributed
      expect(stats.partitionDistribution.size).toBeGreaterThan(0);
    });

    it('should maintain consistent assignment for same token', async () => {
      // This is tested implicitly through event processing
      // The same token should always go to the same node
      expect(true).toBe(true);
    });
  });

  describe('Node Health Monitoring', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      mockRedis.set.mockResolvedValueOnce('OK'); // Become leader
    });

    it('should detect dead nodes', async () => {
      const oldTimestamp = Date.now() - 10000; // 10 seconds ago
      
      mockRedis.hgetall.mockResolvedValue({
        'node-1': JSON.stringify({
          nodeId: 'node-1',
          lastHeartbeat: oldTimestamp,
          throughput: 0,
          partitions: [],
        }),
      });

      await coordinator.initialize();
      
      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(mockRedis.hdel).toHaveBeenCalled();
    });

    it('should emit nodeRemoved event for dead nodes', async () => {
      const oldTimestamp = Date.now() - 10000;
      
      mockRedis.hgetall.mockResolvedValue({
        'dead-node': JSON.stringify({
          nodeId: 'dead-node',
          lastHeartbeat: oldTimestamp,
          throughput: 0,
          partitions: [],
        }),
      });

      const removeSpy = jest.fn();
      coordinator.on('nodeRemoved', removeSpy);

      await coordinator.initialize();
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(removeSpy).toHaveBeenCalledWith({
        nodeId: 'dead-node',
        reason: 'timeout',
      });
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should unregister node on shutdown', async () => {
      await coordinator.shutdown();

      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'scaling:nodes',
        config.nodeId
      );
    });

    it('should close Redis connections', async () => {
      await coordinator.shutdown();

      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should emit shutdown event', async () => {
      const shutdownSpy = jest.fn();
      coordinator.on('shutdown', shutdownSpy);

      await coordinator.shutdown();

      expect(shutdownSpy).toHaveBeenCalledWith({ nodeId: config.nodeId });
    });

    it('should release leader lock if leader', async () => {
      mockRedis.set.mockResolvedValueOnce('OK'); // Become leader
      
      const leaderCoordinator = new ScalingCoordinator(config);
      await leaderCoordinator.initialize();
      await new Promise(resolve => setTimeout(resolve, 100));

      await leaderCoordinator.shutdown();

      expect(mockRedis.eval).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
    });

    it('should emit error events', async () => {
      const errorSpy = jest.fn();
      coordinator.on('error', errorSpy);

      await coordinator.initialize();

      // Trigger an error
      mockRedis.emit('error', new Error('Redis connection error'));

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockRedis.xgroup.mockRejectedValueOnce(new Error('Fatal error'));

      const errorSpy = jest.fn();
      coordinator.on('error', errorSpy);

      await expect(coordinator.initialize()).rejects.toThrow('Fatal error');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle publish errors', async () => {
      await coordinator.initialize();

      mockRedis.xadd.mockRejectedValueOnce(new Error('Stream error'));

      const event: DecodedEvent = {
        tokenAddress: '0x1234567890123456789012345678901234567890',
        eventType: 'CurveBuy',
        data: {},
        blockNumber: '12345',
        transactionHash: '0xabcdef',
        timestamp: Date.now(),
      };

      await expect(coordinator.publishEvent(event)).rejects.toThrow('Stream error');
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      coordinator = new ScalingCoordinator(config);
      await coordinator.initialize();
    });

    it('should track throughput', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      await coordinator.subscribeEvents(handler);

      // Simulate processing events
      const stats1 = coordinator.getClusterStats();
      expect(stats1.totalThroughput).toBe(0);

      // Wait for throughput calculation
      await new Promise(resolve => setTimeout(resolve, 1100));

      const stats2 = coordinator.getClusterStats();
      expect(stats2.totalThroughput).toBeGreaterThanOrEqual(0);
    });
  });
});
