/**
 * Authentication service with JWT and API key support
 */

import { User, ApiKey, Prisma } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { UserService } from './user-service';
import { cacheService } from '../redis/cache';
import { log, LogContext } from '../../utils/logger';
import { config } from '../../config/loader';
import { 
    ValidationError, 
    NotFoundError, 
    UnauthorizedError,
    InternalServerError 
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

/**
 * Authentication interfaces
 */
export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    user: Omit<User, 'password'>;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface TokenPayload {
    userId: string;
    email: string;
    roles: string[];
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
}

export interface ApiKeyRequest {
    name: string;
    permissions: string[];
    expiresAt?: Date;
    rateLimit?: {
        requests: number;
        windowMs: number;
    };
}

export interface ApiKeyResponse {
    id: string;
    keyId: string;
    key: string; // Only returned on creation
    name: string;
    permissions: string[];
    expiresAt?: Date;
    createdAt: Date;
}

export interface RefreshTokenRequest {
    refreshToken: string;
}

/**
 * Authentication service implementation
 */
export class AuthService extends HealthCheckableService {
    private readonly ACCESS_TOKEN_EXPIRY = '15m';
    private readonly REFRESH_TOKEN_EXPIRY = '7d';
    private readonly API_KEY_LENGTH = 32;
    private readonly CACHE_PREFIX = 'auth:';

    constructor(private userService: UserService) {
        super('AuthService');
    }

    /**
     * Authenticate user with email and password
     */
    async login(data: LoginRequest, context?: LogContext): Promise<LoginResponse> {
        const logger = log.child(context || {});
        
        try {
            logger.info('User login attempt', { email: data.email });

            // Validate input
            this.validateLoginRequest(data);

            // Get user by email
            const user = await this.userService.getUserByEmail(data.email, context);
            if (!user) {
                logger.warn('Login failed - user not found', { email: data.email });
                throw new UnauthorizedError('Invalid credentials', context);
            }

            // Check if user is active
            if (!user.isActive) {
                logger.warn('Login failed - user inactive', { email: data.email, userId: user.id });
                throw new UnauthorizedError('Account is inactive', context);
            }

            // Verify password
            const isValidPassword = await this.userService.verifyPassword(user, data.password, context);
            if (!isValidPassword) {
                logger.warn('Login failed - invalid password', { email: data.email, userId: user.id });
                throw new UnauthorizedError('Invalid credentials', context);
            }

            // Get user roles
            const userWithRoles = await this.getUserWithRoles(user.id, context);
            const roles = userWithRoles?.userRoles?.map((ur: any) => ur.role) || [];

            // Generate tokens
            const accessToken = this.generateAccessToken(user, roles);
            const refreshToken = this.generateRefreshToken(user, roles);

            // Cache user session
            await this.cacheUserSession(user.id, { accessToken, refreshToken, roles }, context);

            // Remove password from response
            const { password: _, ...userResponse } = user;

            logger.info('User login successful', { 
                userId: user.id, 
                email: user.email,
                roles 
            });

            return {
                user: userResponse,
                accessToken,
                refreshToken,
                expiresIn: this.getTokenExpirySeconds(this.ACCESS_TOKEN_EXPIRY)
            };

        } catch (error) {
            logger.error('Login failed', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof ValidationError || error instanceof UnauthorizedError) {
                throw error;
            }

            throw new InternalServerError('Login failed', context);
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(data: RefreshTokenRequest, context?: LogContext): Promise<Omit<LoginResponse, 'user'>> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Token refresh attempt');

            // Validate and decode refresh token
            const payload = this.verifyToken(data.refreshToken, 'refresh');
            
            // Get user
            const user = await this.userService.getUserById(payload.userId, context);
            if (!user || !user.isActive) {
                throw new UnauthorizedError('Invalid refresh token', context);
            }

            // Check if refresh token is still valid in cache
            const cachedSession = await this.getCachedUserSession(user.id, context);
            if (!cachedSession || cachedSession.refreshToken !== data.refreshToken) {
                throw new UnauthorizedError('Invalid refresh token', context);
            }

            // Get current roles
            const userWithRoles = await this.getUserWithRoles(user.id, context);
            const roles = userWithRoles?.userRoles?.map((ur: any) => ur.role) || [];

            // Generate new tokens
            const accessToken = this.generateAccessToken(user, roles);
            const refreshToken = this.generateRefreshToken(user, roles);

            // Update cached session
            await this.cacheUserSession(user.id, { accessToken, refreshToken, roles }, context);

            logger.info('Token refresh successful', { userId: user.id });

            return {
                accessToken,
                refreshToken,
                expiresIn: this.getTokenExpirySeconds(this.ACCESS_TOKEN_EXPIRY)
            };

        } catch (error) {
            logger.error('Token refresh failed', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof UnauthorizedError) {
                throw error;
            }

            throw new InternalServerError('Token refresh failed', context);
        }
    }

    /**
     * Logout user and invalidate tokens
     */
    async logout(userId: string, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});
        
        try {
            logger.info('User logout', { userId });

            // Remove cached session
            await this.invalidateUserSession(userId, context);

            logger.info('User logout successful', { userId });

        } catch (error) {
            logger.error('Logout failed', error instanceof Error ? error : new Error(String(error)));
            throw new InternalServerError('Logout failed', context);
        }
    }

    /**
     * Verify JWT token
     */
    verifyToken(token: string, expectedType: 'access' | 'refresh' = 'access'): TokenPayload {
        try {
            const payload = jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
            
            if (payload.type !== expectedType) {
                throw new UnauthorizedError(`Invalid token type. Expected ${expectedType}`);
            }

            return payload;

        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new UnauthorizedError('Invalid token');
            }
            if (error instanceof jwt.TokenExpiredError) {
                throw new UnauthorizedError('Token expired');
            }
            throw error;
        }
    }

    /**
     * Create API key for user
     */
    async createApiKey(userId: string, data: ApiKeyRequest, context?: LogContext): Promise<ApiKeyResponse> {
        const logger = log.child(context || {});
        
        try {
            logger.info('Creating API key', { userId, name: data.name });

            // Validate user exists
            const user = await this.userService.getUserById(userId, context);
            if (!user) {
                throw new NotFoundError('User not found', 'user', userId, context);
            }

            // Generate API key
            const keyId = this.generateKeyId();
            const key = this.generateApiKey();
            const hashedKey = await this.hashApiKey(key);

            // Create API key record
            const prisma = this.userService['prisma']; // Access private prisma client
            const apiKey = await prisma.apiKey.create({
                data: {
                    keyId,
                    hashedKey,
                    userId,
                    name: data.name,
                    permissions: data.permissions,
                    expiresAt: data.expiresAt,
                    rateLimit: data.rateLimit || { requests: 1000, windowMs: 3600000 } // Default: 1000 req/hour
                }
            });

            // Cache API key for quick lookup
            await this.cacheApiKey(keyId, apiKey, context);

            logger.info('API key created successfully', { 
                userId, 
                keyId, 
                name: data.name 
            });

            return {
                id: apiKey.id,
                keyId,
                key, // Only returned on creation
                name: apiKey.name,
                permissions: apiKey.permissions as string[],
                expiresAt: apiKey.expiresAt || undefined,
                createdAt: apiKey.createdAt
            };

        } catch (error) {
            logger.error('Failed to create API key', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof NotFoundError) {
                throw error;
            }

            throw new InternalServerError('Failed to create API key', context);
        }
    }

    /**
     * Verify API key
     */
    async verifyApiKey(keyId: string, key: string, context?: LogContext): Promise<ApiKey | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Verifying API key', { keyId });

            // Try cache first
            let apiKey = await this.getCachedApiKey(keyId, context);
            
            if (!apiKey) {
                // Get from database
                const prisma = this.userService['prisma']; // Access private prisma client
                apiKey = await prisma.apiKey.findUnique({
                    where: { keyId },
                    include: { user: true }
                });

                if (apiKey) {
                    await this.cacheApiKey(keyId, apiKey, context);
                }
            }

            if (!apiKey) {
                logger.debug('API key not found', { keyId });
                return null;
            }

            // Check if API key is expired
            if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
                logger.debug('API key expired', { keyId, expiresAt: apiKey.expiresAt });
                return null;
            }

            // Verify key hash
            const isValidKey = await bcrypt.compare(key, apiKey.hashedKey);
            if (!isValidKey) {
                logger.debug('API key hash verification failed', { keyId });
                return null;
            }

            logger.debug('API key verified successfully', { keyId });
            return apiKey;

        } catch (error) {
            logger.error('API key verification failed', error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }

    /**
     * Revoke API key
     */
    async revokeApiKey(keyId: string, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});
        
        try {
            logger.info('Revoking API key', { keyId });

            // Delete from database
            const prisma = this.userService['prisma']; // Access private prisma client
            await prisma.apiKey.delete({
                where: { keyId }
            });

            // Remove from cache
            await this.invalidateApiKey(keyId, context);

            logger.info('API key revoked successfully', { keyId });

        } catch (error) {
            logger.error('Failed to revoke API key', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new NotFoundError('API key not found', 'apiKey', keyId, context);
            }

            throw new InternalServerError('Failed to revoke API key', context);
        }
    }

    /**
     * Private helper methods
     */

    private validateLoginRequest(data: LoginRequest): void {
        if (!data.email || !data.password) {
            throw new ValidationError('Email and password are required');
        }

        if (!this.isValidEmail(data.email)) {
            throw new ValidationError('Invalid email format', 'email', data.email);
        }
    }

    private generateAccessToken(user: User, roles: string[]): string {
        const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
            userId: user.id,
            email: user.email,
            roles,
            type: 'access'
        };

        return jwt.sign(payload, config.auth.jwtSecret, {
            expiresIn: this.ACCESS_TOKEN_EXPIRY
        });
    }

    private generateRefreshToken(user: User, roles: string[]): string {
        const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
            userId: user.id,
            email: user.email,
            roles,
            type: 'refresh'
        };

        return jwt.sign(payload, config.auth.jwtSecret, {
            expiresIn: this.REFRESH_TOKEN_EXPIRY
        });
    }

    private generateKeyId(): string {
        return `ak_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    private generateApiKey(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < this.API_KEY_LENGTH; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    private async hashApiKey(key: string): Promise<string> {
        const saltRounds = config.auth.bcryptRounds;
        return bcrypt.hash(key, saltRounds);
    }

    private getTokenExpirySeconds(expiry: string): number {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) return 900; // Default 15 minutes

        const value = parseInt(match[1]!);
        const unit = match[2];

        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 3600;
            case 'd': return value * 86400;
            default: return 900;
        }
    }

    private async getUserWithRoles(userId: string, _context?: LogContext): Promise<any> {
        const prisma = this.userService['prisma']; // Access private prisma client
        return prisma.user.findUnique({
            where: { id: userId },
            include: { userRoles: true }
        });
    }

    private async cacheUserSession(userId: string, session: any, _context?: LogContext): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}session:${userId}`;
        await cacheService.set(cacheKey, session, { ttl: 604800 }); // 7 days
    }

    private async getCachedUserSession(userId: string, _context?: LogContext): Promise<any> {
        const cacheKey = `${this.CACHE_PREFIX}session:${userId}`;
        return cacheService.get(cacheKey);
    }

    private async invalidateUserSession(userId: string, _context?: LogContext): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}session:${userId}`;
        await cacheService.delete(cacheKey);
    }

    private async cacheApiKey(keyId: string, apiKey: any, _context?: LogContext): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}apikey:${keyId}`;
        await cacheService.set(cacheKey, apiKey, { ttl: 3600 }); // 1 hour
    }

    private async getCachedApiKey(keyId: string, _context?: LogContext): Promise<any> {
        const cacheKey = `${this.CACHE_PREFIX}apikey:${keyId}`;
        return cacheService.get(cacheKey);
    }

    private async invalidateApiKey(keyId: string, _context?: LogContext): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}apikey:${keyId}`;
        await cacheService.delete(cacheKey);
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Perform health check
     */
    async performHealthCheck(_context?: LogContext): Promise<ServiceHealthCheck> {
        const startTime = Date.now();
        
        try {
            // Test JWT signing and verification
            const testPayload = { userId: 'test', email: 'test@example.com', roles: [], type: 'access' as const };
            const testToken = jwt.sign(testPayload, config.auth.jwtSecret, { expiresIn: '1m' });
            jwt.verify(testToken, config.auth.jwtSecret);
            
            const latency = Date.now() - startTime;
            
            return {
                name: 'AuthService',
                status: 'healthy',
                latency,
                details: {
                    jwt: 'functional',
                    cache: 'connected'
                }
            };

        } catch (error) {
            const latency = Date.now() - startTime;
            
            return {
                name: 'AuthService',
                status: 'unhealthy',
                latency,
                error: error instanceof Error ? error.message : String(error),
                details: {
                    jwt: 'failed'
                }
            };
        }
    }
}