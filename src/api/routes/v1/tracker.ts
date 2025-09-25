/**
 * Tracker routes
 */

import { Router } from 'express';
import { TrackerController } from '../../controllers';
import { authenticate } from '../../../middleware/auth';

const router = Router();
const trackerController = new TrackerController();

/**
 * @swagger
 * /api/v1/tracker/metrics:
 *   get:
 *     summary: Get tracker metrics
 *     tags: [Tracker]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tracker metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     monad:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         uptime:
 *                           type: number
 *                         metrics:
 *                           type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/metrics', authenticate, trackerController.getMetrics);

/**
 * @swagger
 * /api/v1/tracker/health:
 *   get:
 *     summary: Get tracker health status
 *     tags: [Tracker]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tracker health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     monad:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         uptime:
 *                           type: number
 *                         status:
 *                           type: string
 *                           enum: [healthy, disconnected]
 *                     overall:
 *                       type: string
 *                       enum: [healthy, degraded]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/health', authenticate, trackerController.getHealth);

/**
 * @swagger
 * /api/v1/tracker/monad/metrics:
 *   get:
 *     summary: Get Monad tracker specific metrics
 *     tags: [Tracker]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Monad tracker metrics retrieved successfully
 */
router.get('/monad/metrics', authenticate, trackerController.getMonadMetrics);

export default router;