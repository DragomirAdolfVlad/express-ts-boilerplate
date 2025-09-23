/**
 * Service factories for dependency injection
 */

import { BaseServiceFactory, getService } from './container';
import { UserService } from '../database/user-service';
import { AuthService } from '../database/auth-service';
import { TokenTradeService } from '../database/token-trade-service';
import { CacheService, enhancedCacheService } from '../redis/cache-service';
import { getPrismaClient } from '../database/database';
import { log } from '../../utils/logger';

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
 * Auth service factory
 */
export class AuthServiceFactory extends BaseServiceFactory<AuthService> {
    create(): AuthService {
        log.debug('Creating AuthService instance');
        
        const userService = getService<UserService>('userService');
        return new AuthService(userService);
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
    authService: new AuthServiceFactory(),
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