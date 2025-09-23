/**
 * Authentication middleware for JWT and API key validation
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth-service';
import { getService } from '../services/container';
import { log } from '../utils/logger';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

/**
 * Extended Request interface with auth context
 */
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        roles: string[];
    };
    apiKey?: {
        id: string;
        keyId: string;
        userId: string;
        permissions: string[];
    };
    authType?: 'jwt' | 'apikey';
}

/**
 * JWT Authentication middleware
 */
export function authenticateJWT(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing or invalid authorization header');
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        const authService = getService<AuthService>('authService');
        const payload = authService.verifyToken(token, 'access');

        // Add user context to request
        req.user = {
            id: payload.userId,
            email: payload.email,
            roles: payload.roles
        };
        req.authType = 'jwt';

        log.debug('JWT authentication successful', {
            userId: payload.userId,
            email: payload.email,
            roles: payload.roles,
            requestId: req.headers['x-request-id'] as string
        });

        next();

    } catch (error) {
        log.warn('JWT authentication failed', {
            error: error instanceof Error ? error.message : String(error),
            requestId: req.headers['x-request-id'] as string,
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });

        next(error);
    }
}

/**
 * API Key Authentication middleware
 */
export function authenticateApiKey(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    try {
        const apiKeyHeader = req.headers['x-api-key'] as string;
        
        if (!apiKeyHeader) {
            throw new UnauthorizedError('Missing API key header');
        }

        // Parse API key format: keyId.key
        const [keyId, key] = apiKeyHeader.split('.');
        
        if (!keyId || !key) {
            throw new UnauthorizedError('Invalid API key format');
        }

        const authService = getService<AuthService>('authService');
        
        // Verify API key asynchronously
        authService.verifyApiKey(keyId, key, { requestId: req.headers['x-request-id'] as string })
            .then(apiKey => {
                if (!apiKey) {
                    throw new UnauthorizedError('Invalid API key');
                }

                // Add API key context to request
                req.apiKey = {
                    id: apiKey.id,
                    keyId: apiKey.keyId,
                    userId: apiKey.userId,
                    permissions: apiKey.permissions as string[]
                };
                req.authType = 'apikey';

                log.debug('API key authentication successful', {
                    keyId: apiKey.keyId,
                    userId: apiKey.userId,
                    permissions: apiKey.permissions,
                    requestId: req.headers['x-request-id'] as string
                });

                next();
            })
            .catch(error => {
                log.warn('API key authentication failed', {
                    keyId,
                    error: error instanceof Error ? error.message : String(error),
                    requestId: req.headers['x-request-id'] as string,
                    userAgent: req.headers['user-agent'],
                    ip: req.ip
                });

                next(error);
            });

    } catch (error) {
        log.warn('API key authentication failed', {
            error: error instanceof Error ? error.message : String(error),
            requestId: req.headers['x-request-id'] as string,
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });

        next(error);
    }
}

/**
 * Flexible authentication middleware (JWT or API Key)
 */
export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    // Try JWT first if Bearer token is present
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authenticateJWT(req, res, next);
    }

    // Try API key if present
    if (apiKeyHeader) {
        return authenticateApiKey(req, res, next);
    }

    // No authentication method provided
    const error = new UnauthorizedError('Authentication required. Provide either Bearer token or API key');
    
    log.warn('Authentication failed - no credentials provided', {
        requestId: req.headers['x-request-id'] as string,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        path: req.path,
        method: req.method
    });

    next(error);
}

/**
 * Optional authentication middleware (doesn't fail if no auth provided)
 */
export function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    // If no authentication provided, continue without user context
    if (!authHeader && !apiKeyHeader) {
        return next();
    }

    // Use regular authenticate middleware if credentials are provided
    authenticate(req, res, next);
}

/**
 * Role-based authorization middleware
 */
export function requireRoles(...requiredRoles: string[]) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        try {
            if (!req.user && !req.apiKey) {
                throw new UnauthorizedError('Authentication required');
            }

            let userRoles: string[] = [];

            if (req.user) {
                userRoles = req.user.roles;
            } else if (req.apiKey) {
                // For API keys, treat permissions as roles
                userRoles = req.apiKey.permissions;
            }

            // Check if user has any of the required roles
            const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

            if (!hasRequiredRole) {
                log.warn('Authorization failed - insufficient roles', {
                    userId: req.user?.id || req.apiKey?.userId,
                    userRoles,
                    requiredRoles,
                    requestId: req.headers['x-request-id'] as string,
                    path: req.path,
                    method: req.method
                });

                throw new ForbiddenError(`Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`);
            }

            log.debug('Authorization successful', {
                userId: req.user?.id || req.apiKey?.userId,
                userRoles,
                requiredRoles,
                requestId: req.headers['x-request-id'] as string
            });

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermissions(...requiredPermissions: string[]) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        try {
            if (!req.user && !req.apiKey) {
                throw new UnauthorizedError('Authentication required');
            }

            let userPermissions: string[] = [];

            if (req.user) {
                // For JWT users, roles act as permissions
                userPermissions = req.user.roles;
            } else if (req.apiKey) {
                userPermissions = req.apiKey.permissions;
            }

            // Check if user has all required permissions
            const hasAllPermissions = requiredPermissions.every(permission => 
                userPermissions.includes(permission)
            );

            if (!hasAllPermissions) {
                log.warn('Authorization failed - insufficient permissions', {
                    userId: req.user?.id || req.apiKey?.userId,
                    userPermissions,
                    requiredPermissions,
                    requestId: req.headers['x-request-id'] as string,
                    path: req.path,
                    method: req.method
                });

                throw new ForbiddenError(`Insufficient permissions. Required: ${requiredPermissions.join(', ')}`);
            }

            log.debug('Permission check successful', {
                userId: req.user?.id || req.apiKey?.userId,
                userPermissions,
                requiredPermissions,
                requestId: req.headers['x-request-id'] as string
            });

            next();

        } catch (error) {
            next(error);
        }
    };
}

/**
 * Admin-only authorization middleware
 */
export const requireAdmin = requireRoles('ADMIN');

/**
 * User or Admin authorization middleware
 */
export const requireUserOrAdmin = requireRoles('USER', 'ADMIN');

/**
 * Self or Admin authorization middleware (user can access their own resources)
 */
export function requireSelfOrAdmin(userIdParam: string = 'userId') {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        try {
            if (!req.user && !req.apiKey) {
                throw new UnauthorizedError('Authentication required');
            }

            const targetUserId = req.params[userIdParam];
            const currentUserId = req.user?.id || req.apiKey?.userId;
            const userRoles = req.user?.roles || req.apiKey?.permissions || [];

            // Allow if user is admin
            if (userRoles.includes('ADMIN')) {
                return next();
            }

            // Allow if user is accessing their own resource
            if (currentUserId === targetUserId) {
                return next();
            }

            log.warn('Authorization failed - not self or admin', {
                currentUserId,
                targetUserId,
                userRoles,
                requestId: req.headers['x-request-id'] as string,
                path: req.path,
                method: req.method
            });

            throw new ForbiddenError('Access denied. You can only access your own resources or need admin privileges');

        } catch (error) {
            next(error);
        }
    };
}