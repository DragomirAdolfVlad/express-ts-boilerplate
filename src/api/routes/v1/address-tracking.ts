/**
 * Address tracking routes for monitoring specific addresses
 */

import { Router } from 'express';
import { AddressTrackingController } from '../../controllers/address-tracking-controller';
import { validateBody, validateParams, validateQuery } from '../../../middleware/validation';
import { authenticate, requireRoles } from '../../../middleware';
import Joi from 'joi';

const router = Router();
const addressTrackingController = new AddressTrackingController();

// Validation schemas
const trackAddressSchema = Joi.object({
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
    label: Joi.string().min(1).max(100).optional(),
    alerts: Joi.object({
        incomingTransactions: Joi.boolean().optional(),
        outgoingTransactions: Joi.boolean().optional(),
        balanceThreshold: Joi.string().optional().allow(null),
        tokenTransfers: Joi.boolean().optional()
    }).optional()
});

const updateTrackedAddressSchema = Joi.object({
    label: Joi.string().min(1).max(100).optional().allow(null),
    alerts: Joi.object({
        incomingTransactions: Joi.boolean().optional(),
        outgoingTransactions: Joi.boolean().optional(),
        balanceThreshold: Joi.string().optional().allow(null),
        tokenTransfers: Joi.boolean().optional()
    }).optional()
});

const addressParamSchema = Joi.object({
    address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required()
});

const recentActivityQuerySchema = Joi.object({
    hours: Joi.number().integer().min(1).max(168).optional()
});

const bulkUpdateBalancesSchema = Joi.object({
    addressBalances: Joi.array().items(
        Joi.object({
            address: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).required(),
            balance: Joi.alternatives().try(
                Joi.string(),
                Joi.number()
            ).required()
        })
    ).min(1).max(1000).required()
});

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/address-tracking/track:
 *   post:
 *     summary: Add an address to user's tracking list
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 pattern: '^0x[a-fA-F0-9]{40}$'
 *                 description: Ethereum address to track
 *               label:
 *                 type: string
 *                 maxLength: 100
 *                 description: Optional label for the address
 *               alerts:
 *                 type: object
 *                 properties:
 *                   incomingTransactions:
 *                     type: boolean
 *                     default: true
 *                   outgoingTransactions:
 *                     type: boolean
 *                     default: true
 *                   balanceThreshold:
 *                     type: string
 *                     nullable: true
 *                     description: Alert when balance crosses this threshold
 *                   tokenTransfers:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       201:
 *         description: Address added to tracking successfully
 *       400:
 *         description: Invalid request data or address already tracked
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/track',
    validateBody(trackAddressSchema),
    addressTrackingController.trackAddress
);

/**
 * @swagger
 * /api/v1/address-tracking/track/{address}:
 *   delete:
 *     summary: Remove an address from user's tracking list
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Address to remove from tracking
 *     responses:
 *       200:
 *         description: Address removed from tracking successfully
 *       400:
 *         description: Invalid address format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tracked address not found
 *       500:
 *         description: Server error
 */
router.delete('/track/:address',
    validateParams(addressParamSchema),
    addressTrackingController.untrackAddress
);

/**
 * @swagger
 * /api/v1/address-tracking/tracked:
 *   get:
 *     summary: Get all tracked addresses for the authenticated user
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of tracked addresses
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/tracked',
    addressTrackingController.getUserTrackedAddresses
);

/**
 * @swagger
 * /api/v1/address-tracking/track/{address}:
 *   get:
 *     summary: Get details of a specific tracked address
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Tracked address to retrieve
 *     responses:
 *       200:
 *         description: Tracked address details
 *       400:
 *         description: Invalid address format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tracked address not found
 *       500:
 *         description: Server error
 */
router.get('/track/:address',
    validateParams(addressParamSchema),
    addressTrackingController.getTrackedAddress
);

/**
 * @swagger
 * /api/v1/address-tracking/track/{address}:
 *   put:
 *     summary: Update tracked address settings
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Address to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *                 description: Updated label for the address
 *               alerts:
 *                 type: object
 *                 properties:
 *                   incomingTransactions:
 *                     type: boolean
 *                   outgoingTransactions:
 *                     type: boolean
 *                   balanceThreshold:
 *                     type: string
 *                     nullable: true
 *                   tokenTransfers:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Tracked address updated successfully
 *       400:
 *         description: Invalid request data or address format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tracked address not found
 *       500:
 *         description: Server error
 */
router.put('/track/:address',
    validateParams(addressParamSchema),
    validateBody(updateTrackedAddressSchema),
    addressTrackingController.updateTrackedAddress
);

/**
 * @swagger
 * /api/v1/address-tracking/addresses/{address}/stats:
 *   get:
 *     summary: Get address statistics
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Address to get statistics for
 *     responses:
 *       200:
 *         description: Address statistics
 *       400:
 *         description: Invalid address format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Server error
 */
router.get('/addresses/:address/stats',
    validateParams(addressParamSchema),
    addressTrackingController.getAddressStats
);

/**
 * @swagger
 * /api/v1/address-tracking/recent-activity:
 *   get:
 *     summary: Get addresses with recent activity (for alerts)
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 1
 *         description: Number of hours to look back for activity
 *     responses:
 *       200:
 *         description: Addresses with recent activity
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/recent-activity',
    validateQuery(recentActivityQuerySchema),
    addressTrackingController.getRecentActivity
);

/**
 * @swagger
 * /api/v1/address-tracking/bulk-update-balances:
 *   post:
 *     summary: Bulk update address balances (admin only)
 *     tags: [Address Tracking]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - addressBalances
 *             properties:
 *               addressBalances:
 *                 type: array
 *                 maxItems: 1000
 *                 items:
 *                   type: object
 *                   required:
 *                     - address
 *                     - balance
 *                   properties:
 *                     address:
 *                       type: string
 *                       pattern: '^0x[a-fA-F0-9]{40}$'
 *                     balance:
 *                       oneOf:
 *                         - type: string
 *                         - type: number
 *     responses:
 *       200:
 *         description: Balances updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/bulk-update-balances',
    requireRoles('ADMIN'),
    validateBody(bulkUpdateBalancesSchema),
    addressTrackingController.bulkUpdateBalances
);

export default router;