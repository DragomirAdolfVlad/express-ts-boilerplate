/**
 * Service container for dependency injection
 */

import { getPrismaClient } from '../database/database';
import { getRedisClient } from '../redis/redis';
import { cacheService } from '../redis/cache';
import { log } from '../../utils/logger';

/**
 * Service container interface
 */
export interface ServiceContainer {
    userService: any; // Will be properly typed when used
    authService: any; // Will be properly typed when used
    cacheService: typeof cacheService;
    databaseService: ReturnType<typeof getPrismaClient>;
    redisService: ReturnType<typeof getRedisClient>;
    monadClientService: any; // MonadClientService
    blockchainTrackerService: any; // BlockchainTrackerService
    nadFunService: any; // NadFunService
}

/**
 * Service factory interface
 */
export interface ServiceFactory<T> {
    create(): T;
    getInstance(): T;
}

/**
 * Base service factory implementation
 */
export abstract class BaseServiceFactory<T> implements ServiceFactory<T> {
    private instance: T | null = null;

    abstract create(): T;

    getInstance(): T {
        if (!this.instance) {
            this.instance = this.create();
            log.debug('Service instance created', { 
                service: this.constructor.name,
                timestamp: new Date().toISOString()
            });
        }
        return this.instance;
    }

    /**
     * Reset instance (useful for testing)
     */
    reset(): void {
        this.instance = null;
    }
}

/**
 * Service registry for managing service instances
 */
class ServiceRegistry {
    private services = new Map<string, any>();
    private factories = new Map<string, ServiceFactory<any>>();

    /**
     * Register a service factory
     */
    registerFactory<T>(name: string, factory: ServiceFactory<T>): void {
        this.factories.set(name, factory);
        log.debug('Service factory registered', { service: name });
    }

    /**
     * Register a service instance
     */
    registerInstance<T>(name: string, instance: T): void {
        this.services.set(name, instance);
        log.debug('Service instance registered', { service: name });
    }

    /**
     * Get service instance
     */
    get<T>(name: string): T {
        // Check if instance already exists
        if (this.services.has(name)) {
            return this.services.get(name) as T;
        }

        // Check if factory exists
        const factory = this.factories.get(name);
        if (factory) {
            const instance = factory.getInstance();
            this.services.set(name, instance);
            return instance as T;
        }

        throw new Error(`Service '${name}' not found in registry`);
    }

    /**
     * Check if service is registered
     */
    has(name: string): boolean {
        return this.services.has(name) || this.factories.has(name);
    }

    /**
     * Get all registered service names
     */
    getServiceNames(): string[] {
        const instanceNames = Array.from(this.services.keys());
        const factoryNames = Array.from(this.factories.keys());
        const allNames = instanceNames.concat(factoryNames);
        return Array.from(new Set(allNames));
    }

    /**
     * Clear all services (useful for testing)
     */
    clear(): void {
        this.services.clear();
        this.factories.clear();
        log.debug('Service registry cleared');
    }
}

// Global service registry instance
const serviceRegistry = new ServiceRegistry();

/**
 * Service container implementation
 */
class Container implements ServiceContainer {
    get userService(): any {
        return serviceRegistry.get<any>('userService');
    }

    get authService(): any {
        return serviceRegistry.get<any>('authService');
    }

    get cacheService(): typeof cacheService {
        return serviceRegistry.get<typeof cacheService>('cacheService');
    }

    get databaseService(): ReturnType<typeof getPrismaClient> {
        return serviceRegistry.get<ReturnType<typeof getPrismaClient>>('databaseService');
    }

    get redisService(): ReturnType<typeof getRedisClient> {
        return serviceRegistry.get<ReturnType<typeof getRedisClient>>('redisService');
    }

    get monadClientService(): any {
        return serviceRegistry.get<any>('monadClientService');
    }

    get blockchainTrackerService(): any {
        return serviceRegistry.get<any>('blockchainTrackerService');
    }

    get nadFunService(): any {
        return serviceRegistry.get<any>('nadFunService');
    }
}

// Global container instance
const container = new Container();

/**
 * Initialize service container with default services
 */
export function initializeContainer(): void {
    log.info('Initializing service container...');

    // Register core services
    serviceRegistry.registerInstance('databaseService', getPrismaClient());
    serviceRegistry.registerInstance('redisService', getRedisClient());
    serviceRegistry.registerInstance('cacheService', cacheService);

    // Import and register service factories
    const { serviceFactories } = require('./factories');
    
    // Register service factories
    serviceRegistry.registerFactory('userService', serviceFactories.userService);
    serviceRegistry.registerFactory('authService', serviceFactories.authService);
    serviceRegistry.registerFactory('enhancedCacheService', serviceFactories.cacheService);
    
    // Register blockchain service factories
    serviceRegistry.registerFactory('monadClientService', serviceFactories.monadClientService);
    serviceRegistry.registerFactory('blockchainTrackerService', serviceFactories.blockchainTrackerService);
    serviceRegistry.registerFactory('nadFunService', serviceFactories.nadFunService);

    log.info('Service container initialized', {
        services: serviceRegistry.getServiceNames()
    });
}

/**
 * Get the global service container
 */
export function getContainer(): ServiceContainer {
    return container;
}

/**
 * Register a service factory
 */
export function registerServiceFactory<T>(name: string, factory: ServiceFactory<T>): void {
    serviceRegistry.registerFactory(name, factory);
}

/**
 * Register a service instance
 */
export function registerService<T>(name: string, instance: T): void {
    serviceRegistry.registerInstance(name, instance);
}

/**
 * Get a service by name
 */
export function getService<T>(name: string): T {
    return serviceRegistry.get<T>(name);
}

/**
 * Check if service exists
 */
export function hasService(name: string): boolean {
    return serviceRegistry.has(name);
}

/**
 * Get all service names
 */
export function getServiceNames(): string[] {
    return serviceRegistry.getServiceNames();
}

/**
 * Clear all services (for testing)
 */
export function clearServices(): void {
    serviceRegistry.clear();
}