/**
 * Base controller class with common functionality
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { log, LogContext } from '../../utils/logger';
import { ValidationError, NotFoundError, InternalServerError } from '../../utils/errors';

/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    meta?: {
        timestamp: string;
        requestId?: string;
        version: string;
    };
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

/**
 * Paginated response format
 */
export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
    pagination?: PaginationMeta;
}

/**
 * Base controller class with common functionality
 */
export abstract class BaseController {
    protected readonly controllerName: string;

    constructor(controllerName: string) {
        this.controllerName = controllerName;
    }

    /**
     * Create logger with controller context
     */
    protected createLogger(req: Request, additionalContext?: Record<string, any>): ReturnType<typeof log.child> {
        const context: LogContext = {
            controller: this.controllerName,
            requestId: req.headers['x-request-id'] as string,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
            ...additionalContext
        };

        // Add user context if authenticated
        const authReq = req as AuthenticatedRequest;
        if (authReq.user) {
            context.userId = authReq.user.id;
            context['userEmail'] = authReq.user.email;
        } else if (authReq.apiKey) {
            context['apiKeyId'] = authReq.apiKey.keyId;
            context.userId = authReq.apiKey.userId;
        }

        return log.child(context);
    }

    /**
     * Send success response
     */
    protected success<T>(
        res: Response,
        data: T,
        statusCode: number = 200,
        meta?: Record<string, any>
    ): Response {
        const response: ApiResponse<T> = {
            success: true,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.getHeader('x-request-id') as string,
                version: 'v1',
                ...meta
            }
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Send paginated response
     */
    protected paginated<T>(
        res: Response,
        data: T[],
        pagination: PaginationMeta,
        statusCode: number = 200,
        meta?: Record<string, any>
    ): Response {
        const response: PaginatedResponse<T> = {
            success: true,
            data,
            pagination,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.getHeader('x-request-id') as string,
                version: 'v1',
                ...meta
            }
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Send error response
     */
    protected error(
        res: Response,
        error: Error,
        statusCode?: number,
        details?: any
    ): Response {
        let code = 'INTERNAL_SERVER_ERROR';
        let message = 'An internal server error occurred';
        let status = statusCode || 500;

        // Handle known error types
        if (error instanceof ValidationError) {
            code = 'VALIDATION_ERROR';
            message = error.message;
            status = error.statusCode;
        } else if (error instanceof NotFoundError) {
            code = 'NOT_FOUND';
            message = error.message;
            status = error.statusCode;
        } else if (error instanceof InternalServerError) {
            code = 'INTERNAL_SERVER_ERROR';
            message = error.message;
            status = error.statusCode;
        } else if (error.message) {
            message = error.message;
        }

        const response: ApiResponse = {
            success: false,
            error: {
                code,
                message,
                details
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.getHeader('x-request-id') as string,
                version: 'v1'
            }
        };

        return res.status(status).json(response);
    }

    /**
     * Send created response
     */
    protected created<T>(res: Response, data: T, meta?: Record<string, any>): Response {
        return this.success(res, data, 201, meta);
    }

    /**
     * Send no content response
     */
    protected noContent(res: Response): Response {
        return res.status(204).send();
    }

    /**
     * Extract pagination parameters from query
     */
    protected getPagination(req: Request): { page: number; limit: number; sortBy?: string; sortOrder?: 'asc' | 'desc' } {
        const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 20));
        const sortBy = req.query['sortBy'] as string;
        const sortOrder = (req.query['sortOrder'] as string) === 'asc' ? 'asc' : 'desc';

        return { page, limit, sortBy, sortOrder };
    }

    /**
     * Extract filter parameters from query
     */
    protected getFilters(req: Request, allowedFilters: string[]): Record<string, any> {
        const filters: Record<string, any> = {};

        for (const filter of allowedFilters) {
            const value = req.query[filter];
            if (value !== undefined && value !== null && value !== '') {
                filters[filter] = value;
            }
        }

        return filters;
    }

    /**
     * Async handler wrapper for error handling
     */
    protected asyncHandler(
        fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
    ) {
        return (req: Request, res: Response, next: NextFunction): void => {
            const logger = this.createLogger(req);

            Promise.resolve(fn(req, res, next))
                .catch((error) => {
                    logger.error('Controller error', {
                        error: error.message,
                        stack: error.stack
                    });
                    next(error);
                });
        };
    }

    /**
     * Validate required parameters
     */
    protected validateRequired(params: Record<string, any>, requiredFields: string[]): void {
        const missing = requiredFields.filter(field =>
            params[field] === undefined || params[field] === null || params[field] === ''
        );

        if (missing.length > 0) {
            throw new ValidationError(`Missing required parameters: ${missing.join(', ')}`);
        }
    }

    /**
     * Get user context from authenticated request
     */
    protected getUserContext(req: Request): { userId?: string; userEmail?: string; apiKeyId?: string } {
        const authReq = req as AuthenticatedRequest;
        
        if (authReq.user) {
            return {
                userId: authReq.user.id,
                userEmail: authReq.user.email
            };
        }
        
        if (authReq.apiKey) {
            return {
                userId: authReq.apiKey.userId,
                apiKeyId: authReq.apiKey.keyId
            };
        }

        return {};
    }

    /**
     * Performance timing helper
     */
    protected createTimer() {
        const start = Date.now();
        
        return {
            end: () => Date.now() - start
        };
    }

    /**
     * Log controller action
     */
    protected logAction(req: Request, action: string, data?: Record<string, any>): void {
        const logger = this.createLogger(req);
        
        logger.info(`Controller action: ${action}`, {
            action,
            controller: this.controllerName,
            ...data
        });
    }
}