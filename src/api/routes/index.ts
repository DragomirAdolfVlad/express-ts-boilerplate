/**
 * Main API Router with versioning support
 */

import { Router } from 'express';
import v1Routes from './v1';
import { log } from '../../utils/logger';

const router = Router();

// API versioning
router.use('/v1', v1Routes);

// Future versions can be added here
// router.use('/v2', v2Routes);

// Root API endpoint
router.get('/', (req, res) => {
    const apiInfo = {
        name: 'Express TypeScript Boilerplate API',
        description: 'Production-ready Express.js TypeScript boilerplate for blockchain microservices',
        timestamp: new Date().toISOString(),
        versions: {
            current: 'v1',
            available: ['v1'],
            deprecated: [],
            endpoints: {
                v1: '/api/v1',
                docs: '/api-docs'
            }
        },
        status: 'operational',
        uptime: process.uptime()
    };

    log.info('API root endpoint accessed', {
        requestId: req.headers['x-request-id'] as string,
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    res.json({
        success: true,
        data: apiInfo,
        meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
        }
    });
});

// Global 404 handler for API routes
router.use('*', (req, res) => {
    log.warn('API route not found', {
        method: req.method,
        path: req.originalUrl,
        requestId: req.headers['x-request-id'] as string,
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: {
            code: 'API_ROUTE_NOT_FOUND',
            message: `API route ${req.method} ${req.originalUrl} not found`,
            details: {
                method: req.method,
                path: req.originalUrl,
                suggestion: 'Check available API versions and endpoints',
                availableVersions: ['v1'],
                documentation: '/api-docs'
            }
        },
        meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id']
        }
    });
});

export default router;