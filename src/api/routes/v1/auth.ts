/**
 * Authentication routes - Version 1
 */

import { Router } from 'express';
import { AuthController } from '../../controllers/auth-controller';
import {
    authenticate,
    // createRateLimit,
    // strictRateLimit 
} from '../../../middleware';
import {
    validateBody,
    validateParams,
    commonSchemas
} from '../../../middleware/validation';

const router = Router();
const authController = new AuthController();

// Rate limiting configurations
// const loginRateLimit = createRateLimit({
//     windowMs: 15 * 60 * 1000,  // 15 minutes
//     maxRequests: 5,            // 5 login attempts per 15 minutes
//     message: 'Too many login attempts, please try again later'
// });

// const apiKeyCreateRateLimit = createRateLimit({
//     windowMs: 60 * 60 * 1000,  // 1 hour
//     maxRequests: 10,           // 10 API key creations per hour
//     message: 'Too many API key creation attempts'
// });

// POST /auth/login - User login
router.post('/login',
    // loginRateLimit, // DISABLED for development
    validateBody(commonSchemas.login),
    authController.login
);

// POST /auth/refresh - Refresh access token
router.post('/refresh',
    // strictRateLimit, // DISABLED for development
    validateBody(commonSchemas.refreshToken),
    authController.refreshToken
);

// POST /auth/logout - User logout
router.post('/logout',
    authenticate,
    authController.logout
);

// GET /auth/me - Get current authentication info
router.get('/me',
    authenticate,
    authController.getCurrentUser
);

// POST /auth/verify - Verify token (for debugging)
router.post('/verify',
    // strictRateLimit, // DISABLED for development
    authController.verifyToken
);

// POST /auth/api-keys - Create API key
router.post('/api-keys',
    // apiKeyCreateRateLimit, // DISABLED for development
    authenticate,
    validateBody(commonSchemas.createApiKey),
    authController.createApiKey
);

// DELETE /auth/api-keys/:keyId - Revoke API key
router.delete('/api-keys/:keyId',
    // strictRateLimit, // DISABLED for development
    authenticate,
    validateParams(commonSchemas.id),
    authController.revokeApiKey
);

export default router;