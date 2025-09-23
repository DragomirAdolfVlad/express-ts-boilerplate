import Redis, { RedisOptions } from 'ioredis';
import { getConfig } from '../../config';

/**
 * Redis service with connection pooling and health checks
 */

let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;
let redisPublisher: Redis | null = null;

/**
 * Create Redis connection options from configuration
 */
function createRedisOptions(): RedisOptions {
    const config = getConfig();
    
    const options: RedisOptions = {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout,
        keyPrefix: config.redis.keyPrefix,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4, // IPv4
        enableReadyCheck: true
    };

    // Only add password if it exists
    if (config.redis.password) {
        options.password = config.redis.password;
    }

    return options;
}

/**
 * Get Redis client singleton instance
 */
export function getRedisClient(): Redis {
    if (!redisClient) {
        const options = createRedisOptions();
        redisClient = new Redis(options);

        // Event handlers
        redisClient.on('connect', () => {
            console.log('✅ Redis client connected');
        });

        redisClient.on('ready', () => {
            console.log('🚀 Redis client ready');
        });

        redisClient.on('error', (error) => {
            console.error('❌ Redis client error:', error.message);
        });

        redisClient.on('close', () => {
            console.log('🔌 Redis client connection closed');
        });

        redisClient.on('reconnecting', () => {
            console.log('🔄 Redis client reconnecting...');
        });

        // Handle graceful shutdown
        process.on('beforeExit', async () => {
            await disconnectRedis();
        });

        process.on('SIGINT', async () => {
            await disconnectRedis();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await disconnectRedis();
            process.exit(0);
        });
    }

    return redisClient;
}

/**
 * Get Redis subscriber client for pub/sub
 */
export function getRedisSubscriber(): Redis {
    if (!redisSubscriber) {
        const options = createRedisOptions();
        redisSubscriber = new Redis(options);

        redisSubscriber.on('connect', () => {
            console.log('✅ Redis subscriber connected');
        });

        redisSubscriber.on('error', (error) => {
            console.error('❌ Redis subscriber error:', error.message);
        });
    }

    return redisSubscriber;
}

/**
 * Get Redis publisher client for pub/sub
 */
export function getRedisPublisher(): Redis {
    if (!redisPublisher) {
        const options = createRedisOptions();
        redisPublisher = new Redis(options);

        redisPublisher.on('connect', () => {
            console.log('✅ Redis publisher connected');
        });

        redisPublisher.on('error', (error) => {
            console.error('❌ Redis publisher error:', error.message);
        });
    }

    return redisPublisher;
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
    try {
        const client = getRedisClient();
        await client.connect();
        await client.ping();
        console.log('✅ Redis connection successful');
        return true;
    } catch (error) {
        console.error('❌ Redis connection failed:', error instanceof Error ? error.message : error);
        return false;
    }
}

/**
 * Disconnect all Redis connections
 */
export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        redisClient.disconnect(false);
        redisClient = null;
    }

    if (redisSubscriber) {
        redisSubscriber.disconnect(false);
        redisSubscriber = null;
    }

    if (redisPublisher) {
        redisPublisher.disconnect(false);
        redisPublisher = null;
    }

    console.log('🔌 All Redis connections disconnected');
}

/**
 * Reset Redis connections (useful for testing)
 */
export function resetRedisConnections(): void {
    redisClient = null;
    redisSubscriber = null;
    redisPublisher = null;
}