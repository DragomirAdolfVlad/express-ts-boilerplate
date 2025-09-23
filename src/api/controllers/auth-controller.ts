/**
 * Authentication controller for login, logout, and token management
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { getService } from '../../services/container';
import { AuthService, LoginRequest, RefreshTokenRequest, ApiKeyRequest } from '../../services/auth-service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UnauthorizedError } from '../../utils/errors';

/**
 * Authentication controller
 */
export class AuthController extends BaseController {
    private authService: AuthService;

    constructor() {
        super('AuthController');
        this.authService = getService<AuthService>('authService');
    }

    /**
     * POST /api/v1/auth/login - User login
     */
    public login = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('User login attempt', { email: req.body.email });

        // Validate required fields
        this.validateRequired(req.body, ['email', 'password']);

        const loginData: LoginRequest = {
            email: req.body.email,
            password: req.body.password
        };

        // Authenticate user
        const result = await this.authService.login(loginData, { requestId: req.headers['x-request-id'] as string });

        const duration = timer.end();
        logger.info('User login successful', {
            userId: result.user.id,
            email: result.user.email,
            duration: `${duration}ms`
        });

        this.success(res, result);
    });

    /**
     * POST /api/v1/auth/refresh - Refresh access token
     */
    public refreshToken = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        logger.info('Token refresh attempt');

        // Validate required fields
        this.validateRequired(req.body, ['refreshToken']);

        const refreshData: RefreshTokenRequest = {
            refreshToken: req.body.refreshToken
        };

        // Refresh token
        const result = await this.authService.refreshToken(refreshData, { requestId: req.headers['x-request-id'] as string });

        logger.info('Token refresh successful');
        this.success(res, result);
    });

    /**
     * POST /api/v1/auth/logout - User logout
     */
    public logout = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        const userContext = this.getUserContext(req);
        if (!userContext.userId) {
            throw new UnauthorizedError('Authentication required');
        }

        logger.info('User logout', { userId: userContext.userId });

        // Logout user
        await this.authService.logout(userContext.userId, { requestId: req.headers['x-request-id'] as string });

        logger.info('User logout successful', { userId: userContext.userId });
        this.success(res, { message: 'Logged out successfully' });
    });

    /**
     * GET /api/v1/auth/me - Get current user info
     */
    public getCurrentUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const authReq = req as AuthenticatedRequest;

        logger.info('Getting current user info');

        let userInfo: any = {};

        if (authReq.user) {
            userInfo = {
                type: 'jwt',
                user: {
                    id: authReq.user.id,
                    email: authReq.user.email,
                    roles: authReq.user.roles
                }
            };
        } else if (authReq.apiKey) {
            userInfo = {
                type: 'apikey',
                apiKey: {
                    id: authReq.apiKey.id,
                    keyId: authReq.apiKey.keyId,
                    userId: authReq.apiKey.userId,
                    permissions: authReq.apiKey.permissions
                }
            };
        } else {
            throw new UnauthorizedError('Authentication required');
        }

        logger.info('Current user info retrieved', { type: userInfo.type });
        this.success(res, userInfo);
    });

    /**
     * POST /api/v1/auth/api-keys - Create API key
     */
    public createApiKey = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const userContext = this.getUserContext(req);

        if (!userContext.userId) {
            throw new UnauthorizedError('Authentication required');
        }

        logger.info('Creating API key', { userId: userContext.userId });

        // Validate required fields
        this.validateRequired(req.body, ['name']);

        const apiKeyData: ApiKeyRequest = {
            name: req.body.name,
            permissions: req.body.permissions || [],
            expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
            rateLimit: req.body.rateLimit
        };

        // Create API key
        const apiKey = await this.authService.createApiKey(
            userContext.userId, 
            apiKeyData, 
            { requestId: req.headers['x-request-id'] as string }
        );

        logger.info('API key created successfully', {
            userId: userContext.userId,
            keyId: apiKey.keyId,
            name: apiKey.name
        });

        this.created(res, apiKey);
    });

    /**
     * DELETE /api/v1/auth/api-keys/:keyId - Revoke API key
     */
    public revokeApiKey = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const { keyId } = req.params;

        logger.info('Revoking API key', { keyId });

        // Revoke API key
        await this.authService.revokeApiKey(keyId!, { requestId: req.headers['x-request-id'] as string });

        logger.info('API key revoked successfully', { keyId });
        this.success(res, { message: 'API key revoked successfully' });
    });

    /**
     * POST /api/v1/auth/verify - Verify token (for debugging)
     */
    public verifyToken = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        logger.info('Token verification request');

        // Validate required fields
        this.validateRequired(req.body, ['token']);

        try {
            // Verify token
            const payload = this.authService.verifyToken(req.body.token, req.body.type || 'access');

            logger.info('Token verification successful', { 
                userId: payload.userId,
                type: payload.type 
            });

            this.success(res, {
                valid: true,
                payload: {
                    userId: payload.userId,
                    email: payload.email,
                    roles: payload.roles,
                    type: payload.type,
                    exp: payload.exp,
                    iat: payload.iat
                }
            });

        } catch (error) {
            logger.warn('Token verification failed', { 
                error: error instanceof Error ? error.message : String(error) 
            });

            this.success(res, {
                valid: false,
                error: error instanceof Error ? error.message : 'Invalid token'
            });
        }
    });
}