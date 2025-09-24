/**
 * Service factories for dependency injection
 */

import { BaseServiceFactory, getService } from './container';
import { UserService } from '../database/user-service';
import { AuthService } from '../database/auth-service';
import { BlockchainTrackerService } from '../database/blockchain-tracker-service';
import { CacheService, enhancedCacheService } from '../redis/cache-service';
import { MonadClientService } from '../blockchain/monad-client';
import { NadFunService } from '../blockchain/nad-fun-service';
import { BlockchainSyncService } from '../blockchain/blockchain-sync-service';
import { BlockchainWebSocketService } from '../websocket/blockchain-websocket-service';
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
 * Monad blockchain client service factory
 */
export class MonadClientServiceFactory extends BaseServiceFactory<MonadClientService> {
    create(): MonadClientService {
        log.debug('Creating MonadClientService instance');
        
        return new MonadClientService();
    }
}

/**
 * Blockchain tracker service factory
 */
export class BlockchainTrackerServiceFactory extends BaseServiceFactory<BlockchainTrackerService> {
    create(): BlockchainTrackerService {
        log.debug('Creating BlockchainTrackerService instance');
        
        const prisma = getPrismaClient();
        const monadClient = getService<MonadClientService>('monadClientService');
        return new BlockchainTrackerService(prisma, monadClient);
    }
}

/**
 * nad.fun service factory
 */
export class NadFunServiceFactory extends BaseServiceFactory<NadFunService> {
    create(): NadFunService {
        log.debug('Creating NadFunService instance');
        
        const prisma = getPrismaClient();
        const monadClient = getService<MonadClientService>('monadClientService');
        return new NadFunService(prisma, monadClient);
    }
}

/**
 * Blockchain sync service factory
 */
export class BlockchainSyncServiceFactory extends BaseServiceFactory<BlockchainSyncService> {
    create(): BlockchainSyncService {      
        log.debug('Creating BlockchainSyncService instance');
        
        const monadClient = getService<MonadClientService>('monadClientService');
        const blockchainTracker = getService<BlockchainTrackerService>('blockchainTrackerService');
        const nadFunService = getService<NadFunService>('nadFunService');
        
        return new BlockchainSyncService(
            undefined, // Use default config
            monadClient,
            blockchainTracker,
            nadFunService
        );
    }
}

/**
 * Blockchain WebSocket service factory
 */
export class BlockchainWebSocketServiceFactory extends BaseServiceFactory<BlockchainWebSocketService> {
    create(): BlockchainWebSocketService {
        log.debug('Creating BlockchainWebSocketService instance');
        
        return new BlockchainWebSocketService();
    }
}

/**
 * Factory registry for easy access
 */
export const serviceFactories = {
    userService: new UserServiceFactory(),
    authService: new AuthServiceFactory(),
    cacheService: new CacheServiceFactory(),
    monadClientService: new MonadClientServiceFactory(),
    blockchainTrackerService: new BlockchainTrackerServiceFactory(),
    nadFunService: new NadFunServiceFactory(),
    blockchainSyncService: new BlockchainSyncServiceFactory(),
    blockchainWebSocketService: new BlockchainWebSocketServiceFactory()
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