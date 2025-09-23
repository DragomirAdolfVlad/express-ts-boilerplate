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

// GET /health - Basic health check
router.get('/',
    // lenientRateLimit, // DISABLED for development
    healthController.healthCheck
);

// GET /health/detailed - Detailed health check with dependencies
router.get('/detailed',
    // lenientRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    healthController.detailedHealthCheck
);

// GET /health/ready - Readiness probe for Kubernetes
router.get('/ready',
    // lenientRateLimit, // DISABLED for development
    healthController.readinessCheck
);

// GET /health/live - Liveness probe for Kubernetes
router.get('/live',
    // lenientRateLimit, // DISABLED for development
    healthController.livenessCheck
);

// Note: /metrics and /info routes are mounted separately in v1/index.ts
// These routes are only for health-specific endpoints

export default router;