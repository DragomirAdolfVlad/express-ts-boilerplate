/**
 * Health check and metrics routes - Version 1
 */

import { Router } from 'express';
import { HealthController } from '../../controllers/health-controller';
import {
    authenticate,
    requireRoles,
    // lenientRateLimit
} from '../../../middleware';

const router = Router();
const healthController = new HealthController();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     version:
 *                       type: string
 *                     environment:
 *                       type: string
 *                     node:
 *                       type: string
 */
router.get('/',
    // lenientRateLimit, // DISABLED for development
    healthController.healthCheck
);

/**
 * @swagger
 * /api/v1/health/detailed:
 *   get:
 *     summary: Detailed health check with dependencies
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Detailed health status
 *       503:
 *         description: Service unhealthy
 */
router.get('/detailed',
    // lenientRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    healthController.detailedHealthCheck
);

/**
 * @swagger
 * /api/v1/health/ready:
 *   get:
 *     summary: Readiness probe for Kubernetes
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready',
    // lenientRateLimit, // DISABLED for development
    healthController.readinessCheck
);

/**
 * @swagger
 * /api/v1/health/live:
 *   get:
 *     summary: Liveness probe for Kubernetes
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live',
    // lenientRateLimit, // DISABLED for development
    healthController.livenessCheck
);

// Note: /metrics and /info routes are mounted separately in v1/index.ts
// These routes are only for health-specific endpoints

export default router;