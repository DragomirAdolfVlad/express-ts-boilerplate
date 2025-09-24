/**
 * Address tracking controller for monitoring specific addresses
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { AddressTrackingService } from '../../services/database/address-tracking-service';
import { getContainer } from '../../services/di/container';
import { log } from '../../utils/logger';
import { ValidationError, NotFoundError } from '../../utils/errors';

export class AddressTrackingController extends BaseController {
    private addressTrackingService: AddressTrackingService;

    constructor() {
        super();
        this.addressTrackingService = getContainer().addressTrackingService;
    }

    /**
     * Add an address to user's tracking list
     * POST /api/v1/address-tracking/track
     */
    trackAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            logger.info('Adding address to tracking');

            // Get user ID from authenticated user
            const userId = this.getUserId(req);
            
            // Validate required fields
            this.validateRequired(req.body, ['address']);

            const { address, label, alerts } = req.body;

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            const trackingData = {
                userId,
                address: address.toLowerCase(),
                label,
                alerts: alerts || {
                    incomingTransactions: true,
                    outgoingTransactions: true,
                    balanceThreshold: null,
                    tokenTransfers: true
                }
            };

            const trackedAddress = await this.addressTrackingService.trackAddress(
                trackingData,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address added to tracking successfully', {
                trackedAddressId: trackedAddress.id,
                address,
                userId,
                duration: `${duration}ms`
            });

            this.created(res, { trackedAddress });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Remove an address from user's tracking list
     * DELETE /api/v1/address-tracking/track/:address
     */
    untrackAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;
            const userId = this.getUserId(req);

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Removing address from tracking', {
                address,
                userId
            });

            await this.addressTrackingService.untrackAddress(
                userId,
                address.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address removed from tracking successfully', {
                address,
                userId,
                duration: `${duration}ms`
            });

            this.ok(res, { message: 'Address removed from tracking successfully' });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get all tracked addresses for the authenticated user
     * GET /api/v1/address-tracking/tracked
     */
    getUserTrackedAddresses = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const userId = this.getUserId(req);

            logger.info('Fetching user tracked addresses', { userId });

            const trackedAddresses = await this.addressTrackingService.getUserTrackedAddresses(
                userId,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('User tracked addresses fetched successfully', {
                userId,
                count: trackedAddresses.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                trackedAddresses,
                count: trackedAddresses.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Update tracked address settings
     * PUT /api/v1/address-tracking/track/:address
     */
    updateTrackedAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;
            const userId = this.getUserId(req);

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Updating tracked address', {
                address,
                userId,
                updates: Object.keys(req.body)
            });

            const { label, alerts } = req.body;
            const updateData: any = {};

            if (label !== undefined) {
                updateData.label = label;
            }

            if (alerts !== undefined) {
                updateData.alerts = alerts;
            }

            if (Object.keys(updateData).length === 0) {
                throw new ValidationError('No valid update fields provided');
            }

            const updatedTrackedAddress = await this.addressTrackingService.updateTrackedAddress(
                userId,
                address.toLowerCase(),
                updateData,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Tracked address updated successfully', {
                trackedAddressId: updatedTrackedAddress.id,
                address,
                userId,
                duration: `${duration}ms`
            });

            this.ok(res, { trackedAddress: updatedTrackedAddress });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get address statistics
     * GET /api/v1/address-tracking/addresses/:address/stats
     */
    getAddressStats = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Fetching address statistics', { address });

            const stats = await this.addressTrackingService.getAddressStats(
                address.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address statistics fetched successfully', {
                address,
                stats,
                duration: `${duration}ms`
            });

            this.ok(res, {
                address,
                stats
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get a specific tracked address
     * GET /api/v1/address-tracking/track/:address
     */
    getTrackedAddress = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const address = req.params.address;
            const userId = this.getUserId(req);

            // Validate address format
            if (!this.isValidAddress(address)) {
                throw new ValidationError('Invalid address format', 'address');
            }

            logger.info('Fetching tracked address', {
                address,
                userId
            });

            const trackedAddress = await this.addressTrackingService.getTrackedAddress(
                userId,
                address.toLowerCase(),
                { requestId: req.headers['x-request-id'] as string }
            );

            if (!trackedAddress) {
                throw new NotFoundError('Tracked address not found');
            }

            const duration = timer.end();
            logger.info('Tracked address fetched successfully', {
                trackedAddressId: trackedAddress.id,
                address,
                userId,
                duration: `${duration}ms`
            });

            this.ok(res, { trackedAddress });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Get addresses with recent activity (for alerts)
     * GET /api/v1/address-tracking/recent-activity
     */
    getRecentActivity = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            const hoursBack = this.parseIntQuery(req.query.hours as string, 1);
            
            // Limit hours back to reasonable values
            if (hoursBack > 168) { // 1 week max
                throw new ValidationError('Hours back cannot exceed 168 (1 week)', 'hours');
            }

            logger.info('Fetching addresses with recent activity', { hoursBack });

            const activeAddresses = await this.addressTrackingService.getAddressesWithRecentActivity(
                hoursBack,
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Addresses with recent activity fetched successfully', {
                hoursBack,
                count: activeAddresses.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                hoursBack,
                addresses: activeAddresses,
                count: activeAddresses.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Bulk update address balances (admin endpoint)
     * POST /api/v1/address-tracking/bulk-update-balances
     */
    bulkUpdateBalances = async (req: Request, res: Response): Promise<void> => {
        const logger = this.getRequestLogger(req);
        const timer = this.startTimer();

        try {
            // This endpoint should be restricted to admin users or internal services
            logger.info('Bulk updating address balances');

            // Validate required fields
            this.validateRequired(req.body, ['addressBalances']);

            const { addressBalances } = req.body;

            if (!Array.isArray(addressBalances)) {
                throw new ValidationError('addressBalances must be an array', 'addressBalances');
            }

            // Validate each address balance entry
            for (let i = 0; i < addressBalances.length; i++) {
                const entry = addressBalances[i];
                if (!entry.address || !this.isValidAddress(entry.address)) {
                    throw new ValidationError(`Invalid address at index ${i}`, `addressBalances[${i}].address`);
                }
                if (entry.balance === undefined || entry.balance === null) {
                    throw new ValidationError(`Balance required at index ${i}`, `addressBalances[${i}].balance`);
                }
            }

            const updated = await this.addressTrackingService.updateAddressBalances(
                addressBalances.map((entry: any) => ({
                    address: entry.address.toLowerCase(),
                    balance: entry.balance.toString()
                })),
                { requestId: req.headers['x-request-id'] as string }
            );

            const duration = timer.end();
            logger.info('Address balances updated successfully', {
                updated,
                total: addressBalances.length,
                duration: `${duration}ms`
            });

            this.ok(res, {
                message: 'Address balances updated successfully',
                updated,
                total: addressBalances.length
            });
        } catch (error) {
            timer.end();
            this.handleError(error, res, logger);
        }
    };

    /**
     * Helper method to validate address format
     */
    private isValidAddress(address: string): boolean {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Helper method to get user ID from request
     */
    private getUserId(req: Request): string {
        // Assuming user information is attached to request by auth middleware
        const user = (req as any).user;
        if (!user || !user.id) {
            throw new ValidationError('User not authenticated');
        }
        return user.id;
    }
}