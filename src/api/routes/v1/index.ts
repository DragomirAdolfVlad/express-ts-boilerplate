/**
 * API Version 1 Routes
 */

import { Router } from 'express';
import userRoutes from './users';
import authRoutes from './auth';
import healthRoutes from './health';
import trackerRoutes from './tracker';
import { log } from '../../../utils/logger';

const router = Router();

// Mount route modules
router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/tracker', trackerRoutes);

// Import health controller for direct routes
import { HealthController } from '../../controllers/health-controller';
// import { lenientRateLimit } from '../../../middleware';
import { authenticate, requireRoles } from '../../../middleware';

const healthController = new HealthController();

// Metrics and info endpoints (direct routes to avoid path duplication)
router.get('/metrics',
    // lenientRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    healthController.getMetrics
);

router.get('/info',
    // lenientRateLimit, // DISABLED for development
    healthController.getInfo
);

// API version info endpoint
router.get('/', (req, res) => {
    const apiInfo = {
        version: 'v1',
        name: 'Express TypeScript Boilerplate API',
        description: 'Production-ready Express.js TypeScript boilerplate for blockchain microservices',
        timestamp: new Date().toISOString(),
        endpoints: {
            users: '/api/v1/users',
            auth: '/api/v1/auth',
            health: '/api/v1/health',
            metrics: '/api/v1/metrics',
            info: '/api/v1/info',
            docs: '/api-docs'
        },
        features: [
            'JWT Authentication',
            'API Key Authentication',
            'Role-based Access Control',
            'Rate Limiting',
            'Input Validation',
            'Security Headers',
            'Health Checks',
            'Metrics Collection',
            'OpenAPI Documentation'
        ]
    };

    log.info('API v1 info requested', {
        requestId: req.headers['x-request-id'] as string,
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    res.json({
        success: true,
        data: apiInfo,
        meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: 'v1'
        }
    });
});

// 404 handler for v1 routes
router.use('*', (req, res) => {
    log.warn('API v1 route not found', {
        method: req.method,
        path: req.originalUrl,
        requestId: req.headers['x-request-id'] as string,
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${req.method} ${req.originalUrl} not found in API v1`,
            details: {
                method: req.method,
                path: req.originalUrl,
                availableEndpoints: [
                    'GET /api/v1/',
                    'GET /api/v1/users',
                    'POST /api/v1/users',
                    'GET /api/v1/users/me',
                    'PUT /api/v1/users/me',
                    'GET /api/v1/users/:id',
                    'PUT /api/v1/users/:id',
                    'DELETE /api/v1/users/:id',
                    'POST /api/v1/auth/login',
                    'POST /api/v1/auth/refresh',
                    'POST /api/v1/auth/logout',
                    'GET /api/v1/auth/me',
                    'POST /api/v1/auth/verify',
                    'POST /api/v1/auth/api-keys',
                    'DELETE /api/v1/auth/api-keys/:keyId',
                    'GET /api/v1/health',
                    'GET /api/v1/health/detailed',
                    'GET /api/v1/health/ready',
                    'GET /api/v1/health/live',
                    'GET /api/v1/metrics',
                    'GET /api/v1/info'
                ]
            }
        },
        meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'],
            version: 'v1'
        }
    });
});

export default router;