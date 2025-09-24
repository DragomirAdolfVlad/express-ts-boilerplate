/**
 * Service factories for dependency injection
 */

import { BaseServiceFactory, getService } from './container';
import { UserService } from '../database/user-service';
import { AuthService } from '../database/auth-service';
import { BlockchainService } from '../database/blockchain-service';
import { AddressTrackingService } from '../database/address-tracking-service';
import { TokenTrackingService } from '../database/token-tracking-service';
import { NadFunService } from '../database/nad-fun-service';
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
 * Blockchain service factory
 */
export class BlockchainServiceFactory extends BaseServiceFactory<BlockchainService> {
    create(): BlockchainService {
        log.debug('Creating BlockchainService instance');
        
        const prisma = getPrismaClient();
        return new BlockchainService(prisma);
    }
}

/**
 * Address tracking service factory
 */
export class AddressTrackingServiceFactory extends BaseServiceFactory<AddressTrackingService> {
    create(): AddressTrackingService {
        log.debug('Creating AddressTrackingService instance');
        
        const prisma = getPrismaClient();
        return new AddressTrackingService(prisma);
    }
}

/**
 * Token tracking service factory
 */
export class TokenTrackingServiceFactory extends BaseServiceFactory<TokenTrackingService> {
    create(): TokenTrackingService {
        log.debug('Creating TokenTrackingService instance');
        
        const prisma = getPrismaClient();
        return new TokenTrackingService(prisma);
    }
}

/**
 * nad.fun service factory
 */
export class NadFunServiceFactory extends BaseServiceFactory<NadFunService> {
    create(): NadFunService {
        log.debug('Creating NadFunService instance');
        
        const prisma = getPrismaClient();
        return new NadFunService(prisma);
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
    blockchainService: new BlockchainServiceFactory(),
    addressTrackingService: new AddressTrackingServiceFactory(),
    tokenTrackingService: new TokenTrackingServiceFactory(),
    nadFunService: new NadFunServiceFactory(),
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