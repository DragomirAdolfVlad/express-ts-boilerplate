import { getRedisSubscriber, getRedisPublisher } from './redis';

/**
 * Redis pub/sub service for message handling
 */

export interface MessageHandler {
    (channel: string, message: string): void | Promise<void>;
}

export interface PubSubMessage {
    channel: string;
    data: any;
    timestamp: number;
    id?: string;
}

class PubSubService {
    private subscribers = new Map<string, Set<MessageHandler>>();
    private patternSubscribers = new Map<string, Set<MessageHandler>>();
    private isInitialized = false;

    /**
     * Initialize pub/sub service
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        const subscriber = getRedisSubscriber();

        // Handle regular channel messages
        subscriber.on('message', (channel: string, message: string) => {
            this.handleMessage(channel, message);
        });

        // Handle pattern channel messages
        subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
            this.handlePatternMessage(pattern, channel, message);
        });

        subscriber.on('subscribe', (channel: string, count: number) => {
            console.log(`📡 Subscribed to channel: ${channel} (total: ${count})`);
        });

        subscriber.on('unsubscribe', (channel: string, count: number) => {
            console.log(`📡 Unsubscribed from channel: ${channel} (remaining: ${count})`);
        });

        subscriber.on('psubscribe', (pattern: string, count: number) => {
            console.log(`📡 Subscribed to pattern: ${pattern} (total: ${count})`);
        });

        subscriber.on('punsubscribe', (pattern: string, count: number) => {
            console.log(`📡 Unsubscribed from pattern: ${pattern} (remaining: ${count})`);
        });

        await subscriber.connect();
        this.isInitialized = true;
        console.log('✅ PubSub service initialized');
    }

    /**
     * Handle regular channel messages
     */
    private handleMessage(channel: string, message: string): void {
        const handlers = this.subscribers.get(channel);
        if (!handlers || handlers.size === 0) return;

        try {
            const parsedMessage = JSON.parse(message);
            handlers.forEach(handler => {
                try {
                    handler(channel, parsedMessage);
                } catch (error) {
                    console.error(`Error in message handler for channel ${channel}:`, error);
                }
            });
        } catch (error) {
            console.error(`Error parsing message for channel ${channel}:`, error);
        }
    }

    /**
     * Handle pattern channel messages
     */
    private handlePatternMessage(pattern: string, channel: string, message: string): void {
        const handlers = this.patternSubscribers.get(pattern);
        if (!handlers || handlers.size === 0) return;

        try {
            const parsedMessage = JSON.parse(message);
            handlers.forEach(handler => {
                try {
                    handler(channel, parsedMessage);
                } catch (error) {
                    console.error(`Error in pattern handler for ${pattern} (channel: ${channel}):`, error);
                }
            });
        } catch (error) {
            console.error(`Error parsing message for pattern ${pattern} (channel: ${channel}):`, error);
        }
    }

    /**
     * Subscribe to a channel
     */
    async subscribe(channel: string, handler: MessageHandler): Promise<void> {
        await this.initialize();

        if (!this.subscribers.has(channel)) {
            this.subscribers.set(channel, new Set());
            const subscriber = getRedisSubscriber();
            await subscriber.subscribe(channel);
        }

        this.subscribers.get(channel)!.add(handler);
    }

    /**
     * Subscribe to a pattern
     */
    async subscribePattern(pattern: string, handler: MessageHandler): Promise<void> {
        await this.initialize();

        if (!this.patternSubscribers.has(pattern)) {
            this.patternSubscribers.set(pattern, new Set());
            const subscriber = getRedisSubscriber();
            await subscriber.psubscribe(pattern);
        }

        this.patternSubscribers.get(pattern)!.add(handler);
    }

    /**
     * Unsubscribe from a channel
     */
    async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
        const handlers = this.subscribers.get(channel);
        if (!handlers) return;

        if (handler) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.subscribers.delete(channel);
                const subscriber = getRedisSubscriber();
                await subscriber.unsubscribe(channel);
            }
        } else {
            // Remove all handlers for this channel
            this.subscribers.delete(channel);
            const subscriber = getRedisSubscriber();
            await subscriber.unsubscribe(channel);
        }
    }

    /**
     * Unsubscribe from a pattern
     */
    async unsubscribePattern(pattern: string, handler?: MessageHandler): Promise<void> {
        const handlers = this.patternSubscribers.get(pattern);
        if (!handlers) return;

        if (handler) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.patternSubscribers.delete(pattern);
                const subscriber = getRedisSubscriber();
                await subscriber.punsubscribe(pattern);
            }
        } else {
            // Remove all handlers for this pattern
            this.patternSubscribers.delete(pattern);
            const subscriber = getRedisSubscriber();
            await subscriber.punsubscribe(pattern);
        }
    }

    /**
     * Publish a message to a channel
     */
    async publish(channel: string, data: any): Promise<number> {
        try {
            const publisher = getRedisPublisher();
            await publisher.connect();

            const message: PubSubMessage = {
                channel,
                data,
                timestamp: Date.now(),
                id: this.generateMessageId()
            };

            const serializedMessage = JSON.stringify(message);
            const result = await publisher.publish(channel, serializedMessage);
            
            console.log(`📤 Published message to ${channel}: ${result} subscribers`);
            return result;
        } catch (error) {
            console.error(`Error publishing to channel ${channel}:`, error);
            return 0;
        }
    }

    /**
     * Publish multiple messages
     */
    async publishMany(messages: Array<{ channel: string; data: any }>): Promise<number[]> {
        try {
            const publisher = getRedisPublisher();
            await publisher.connect();

            const pipeline = publisher.pipeline();
            const publishedMessages: PubSubMessage[] = [];

            messages.forEach(({ channel, data }) => {
                const message: PubSubMessage = {
                    channel,
                    data,
                    timestamp: Date.now(),
                    id: this.generateMessageId()
                };
                publishedMessages.push(message);
                pipeline.publish(channel, JSON.stringify(message));
            });

            const results = await pipeline.exec();
            const subscriberCounts = results?.map(result => result[1] as number) || [];
            
            console.log(`📤 Published ${messages.length} messages`);
            return subscriberCounts;
        } catch (error) {
            console.error('Error publishing multiple messages:', error);
            return messages.map(() => 0);
        }
    }

    /**
     * Get list of active subscriptions
     */
    getSubscriptions(): { channels: string[]; patterns: string[] } {
        return {
            channels: Array.from(this.subscribers.keys()),
            patterns: Array.from(this.patternSubscribers.keys())
        };
    }

    /**
     * Get subscriber count for a channel
     */
    async getSubscriberCount(channel: string): Promise<number> {
        try {
            const publisher = getRedisPublisher();
            await publisher.connect();
            const result = await publisher.pubsub('NUMSUB', channel);
            return result[1] as number || 0;
        } catch (error) {
            console.error(`Error getting subscriber count for ${channel}:`, error);
            return 0;
        }
    }

    /**
     * Generate unique message ID
     */
    private generateMessageId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Disconnect pub/sub service
     */
    async disconnect(): Promise<void> {
        this.subscribers.clear();
        this.patternSubscribers.clear();
        this.isInitialized = false;
        console.log('🔌 PubSub service disconnected');
    }
}

// Export singleton instance
export const pubSubService = new PubSubService();