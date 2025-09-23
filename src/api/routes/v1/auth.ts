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

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post('/login',
    // loginRateLimit, // DISABLED for development
    validateBody(commonSchemas.login),
    authController.login
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh',
    // strictRateLimit, // DISABLED for development
    validateBody(commonSchemas.refreshToken),
    authController.refreshToken
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Authentication required
 */
router.post('/logout',
    authenticate,
    authController.logout
);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current authentication info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Current authentication info
 *       401:
 *         description: Authentication required
 */
router.get('/me',
    authenticate,
    authController.getCurrentUser
);

/**
 * @swagger
 * /api/v1/auth/verify:
 *   post:
 *     summary: Verify token (for debugging)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [access, refresh]
 *                 default: access
 *     responses:
 *       200:
 *         description: Token verification result
 */
router.post('/verify',
    // strictRateLimit, // DISABLED for development
    authController.verifyToken
);

/**
 * @swagger
 * /api/v1/auth/api-keys:
 *   post:
 *     summary: Create API key
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 */
router.post('/api-keys',
    // apiKeyCreateRateLimit, // DISABLED for development
    authenticate,
    validateBody(commonSchemas.createApiKey),
    authController.createApiKey
);

/**
 * @swagger
 * /api/v1/auth/api-keys/{keyId}:
 *   delete:
 *     summary: Revoke API key
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: API key not found
 */
router.delete('/api-keys/:keyId',
    // strictRateLimit, // DISABLED for development
    authenticate,
    validateParams(commonSchemas.id),
    authController.revokeApiKey
);

export default router;