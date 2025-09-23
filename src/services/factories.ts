/**
 * Service factories for dependency injection
 */

import { BaseServiceFactory } from './container';
import { UserService } from './user-service';
import { CacheService, enhancedCacheService } from './cache-service';
import { getPrismaClient } from './database';
import { log } from '../utils/logger';

/**
 * User service factory
 */
export class UserServiceFactory extends BaseServiceFactory<UserService> {
    create(): UserService {
        log.debug('Creating UserService instance');
        
        const prisma = getPrismaClient();
        return new UserService(prisma);
    }
}

/**
 * Cache service factory
 */
export class CacheServiceFactory extends BaseServiceFactory<CacheService> {
    create(): CacheService {
        log.debug('Creating CacheService instance');
        
        return enhancedCacheService;
    }
}

/**
 * Factory registry for easy access
 */
export const serviceFactories = {
    userService: new UserServiceFactory(),
    cacheService: new CacheServiceFactory()
} as const;

/**
 * Initialize all service factories
 */
export function initializeServiceFactories(): void {
    log.info('Initializing service factories...');
    
    // Pre-warm factories if needed
    Object.entries(serviceFactories).forEach(([name, _factory]) => {
        log.debug('Service factory registered', { service: name });
    });
    
    log.info('Service factories initialized', {
        factories: Object.keys(serviceFactories)
    });
}