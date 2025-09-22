import { cacheService } from './cache';
import { pubSubService } from './pubsub';

/**
 * Cache invalidation patterns and strategies
 */

export interface InvalidationEvent {
    type: 'delete' | 'update' | 'expire';
    keys: string[];
    patterns?: string[];
    reason?: string | undefined;
    timestamp: number;
}

export interface InvalidationRule {
    name: string;
    pattern: string;
    dependencies?: string[];
    ttl?: number;
}

class CacheInvalidationService {
    private rules = new Map<string, InvalidationRule>();
    private dependencies = new Map<string, Set<string>>();
    private isInitialized = false;

    /**
     * Initialize cache invalidation service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Subscribe to invalidation events
        await pubSubService.subscribe('cache:invalidate', this.handleInvalidationEvent.bind(this));

        this.isInitialized = true;
        console.log('✅ Cache invalidation service initialized');
    }

    /**
     * Handle invalidation events from pub/sub
     */
    private async handleInvalidationEvent(_channel: string, message: string): Promise<void> {
        const event = JSON.parse(message) as InvalidationEvent;
        console.log(`🗑️  Processing cache invalidation event: ${event.type}`);

        try {
            switch (event.type) {
                case 'delete':
                    await this.processDeleteEvent(event);
                    break;
                case 'update':
                    await this.processUpdateEvent(event);
                    break;
                case 'expire':
                    await this.processExpireEvent(event);
                    break;
                default:
                    console.warn(`Unknown invalidation event type: ${event.type}`);
            }
        } catch (error) {
            console.error('Error processing invalidation event:', error);
        }
    }

    /**
     * Process delete invalidation event
     */
    private async processDeleteEvent(event: InvalidationEvent): Promise<void> {
        // Delete specific keys
        if (event.keys.length > 0) {
            await cacheService.deleteMany(event.keys);
        }

        // Delete by patterns
        if (event.patterns) {
            for (const pattern of event.patterns) {
                await cacheService.deleteByPattern(pattern);
            }
        }

        // Process dependent keys
        await this.processDependentKeys(event.keys);
    }

    /**
     * Process update invalidation event
     */
    private async processUpdateEvent(event: InvalidationEvent): Promise<void> {
        // For updates, we typically delete the cache to force refresh
        await this.processDeleteEvent(event);
    }

    /**
     * Process expire invalidation event
     */
    private async processExpireEvent(event: InvalidationEvent): Promise<void> {
        // Set TTL to 0 to expire immediately
        for (const key of event.keys) {
            await cacheService.setTTL(key, 0);
        }

        await this.processDependentKeys(event.keys);
    }

    /**
     * Process dependent keys based on invalidation rules
     */
    private async processDependentKeys(keys: string[]): Promise<void> {
        const dependentKeys = new Set<string>();

        for (const key of keys) {
            const deps = this.dependencies.get(key);
            if (deps) {
                deps.forEach(dep => dependentKeys.add(dep));
            }
        }

        if (dependentKeys.size > 0) {
            await cacheService.deleteMany(Array.from(dependentKeys));
            console.log(`🔗 Invalidated ${dependentKeys.size} dependent keys`);
        }
    }

    /**
     * Register invalidation rule
     */
    registerRule(rule: InvalidationRule): void {
        this.rules.set(rule.name, rule);

        // Build dependency graph
        if (rule.dependencies) {
            for (const dep of rule.dependencies) {
                if (!this.dependencies.has(dep)) {
                    this.dependencies.set(dep, new Set());
                }
                this.dependencies.get(dep)!.add(rule.pattern);
            }
        }

        console.log(`📋 Registered invalidation rule: ${rule.name}`);
    }

    /**
     * Unregister invalidation rule
     */
    unregisterRule(ruleName: string): void {
        const rule = this.rules.get(ruleName);
        if (!rule) return;

        // Remove from dependency graph
        if (rule.dependencies) {
            for (const dep of rule.dependencies) {
                const deps = this.dependencies.get(dep);
                if (deps) {
                    deps.delete(rule.pattern);
                    if (deps.size === 0) {
                        this.dependencies.delete(dep);
                    }
                }
            }
        }

        this.rules.delete(ruleName);
        console.log(`📋 Unregistered invalidation rule: ${ruleName}`);
    }

    /**
     * Create invalidation event
     */
    private createEvent(
        type: 'delete' | 'update' | 'expire',
        keys: string[] = [],
        patterns?: string[],
        reason?: string
    ): InvalidationEvent {
        const event: InvalidationEvent = {
            type,
            keys,
            timestamp: Date.now()
        };

        if (patterns) {
            event.patterns = patterns;
        }

        if (reason) {
            event.reason = reason;
        }

        return event;
    }

    /**
     * Invalidate cache by key
     */
    async invalidateByKey(key: string, reason?: string): Promise<void> {
        await this.initialize();

        const event = this.createEvent('delete', [key], undefined, reason);
        await pubSubService.publish('cache:invalidate', event);
    }

    /**
     * Invalidate cache by multiple keys
     */
    async invalidateByKeys(keys: string[], reason?: string): Promise<void> {
        await this.initialize();

        const event = this.createEvent('delete', keys, undefined, reason);
        await pubSubService.publish('cache:invalidate', event);
    }

    /**
     * Invalidate cache by pattern
     */
    async invalidateByPattern(pattern: string, reason?: string): Promise<void> {
        await this.initialize();

        const event = this.createEvent('delete', [], [pattern], reason);
        await pubSubService.publish('cache:invalidate', event);
    }

    /**
     * Invalidate cache by multiple patterns
     */
    async invalidateByPatterns(patterns: string[], reason?: string): Promise<void> {
        await this.initialize();

        const event = this.createEvent('delete', [], patterns, reason);
        await pubSubService.publish('cache:invalidate', event);
    }

    /**
     * Expire cache by key
     */
    async expireByKey(key: string, reason?: string): Promise<void> {
        await this.initialize();

        const event = this.createEvent('expire', [key], undefined, reason);
        await pubSubService.publish('cache:invalidate', event);
    }

    /**
     * Tag-based invalidation
     */
    async invalidateByTag(tag: string, reason?: string): Promise<void> {
        await this.invalidateByPattern(`*:tag:${tag}:*`, reason);
    }

    /**
     * User-based invalidation
     */
    async invalidateByUser(userId: string, reason?: string): Promise<void> {
        await this.invalidateByPattern(`*:user:${userId}:*`, reason);
    }

    /**
     * Resource-based invalidation
     */
    async invalidateByResource(resource: string, reason?: string): Promise<void> {
        await this.invalidateByPattern(`*:${resource}:*`, reason);
    }

    /**
     * Time-based invalidation (expire all keys older than timestamp)
     */
    async invalidateOlderThan(timestamp: number, _reason?: string): Promise<void> {
        // This would require storing timestamps with keys
        // Implementation depends on specific caching strategy
        console.log(`⏰ Time-based invalidation for keys older than ${new Date(timestamp)}`);
    }

    /**
     * Get invalidation rules
     */
    getRules(): InvalidationRule[] {
        return Array.from(this.rules.values());
    }

    /**
     * Get dependency graph
     */
    getDependencies(): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        this.dependencies.forEach((deps, key) => {
            result[key] = Array.from(deps);
        });
        return result;
    }
}

// Export singleton instance
export const cacheInvalidationService = new CacheInvalidationService();

// Common invalidation patterns
export const InvalidationPatterns = {
    USER_DATA: (userId: string) => `user:${userId}:*`,
    USER_SESSIONS: (userId: string) => `session:${userId}:*`,
    API_RESPONSES: (endpoint: string) => `api:${endpoint}:*`,
    DATABASE_ENTITY: (entity: string, id: string) => `db:${entity}:${id}:*`,
    SEARCH_RESULTS: (query: string) => `search:${query}:*`,
    PERMISSIONS: (userId: string) => `permissions:${userId}:*`,
    CONFIGURATION: () => 'config:*',
    STATISTICS: () => 'stats:*'
};