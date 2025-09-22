import { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError, createErrorFromUnknown } from '../utils/errors';
import { log } from '../utils/logger';

/**
 * Centralized error handling middleware
 */

export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
        statusCode: number;
        correlationId?: string;
        timestamp: string;
        details?: Record<string, unknown>;
    };
}

/**
 * Main error handling middleware
 */
export function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Convert unknown error to AppError
    const appError = createErrorFromUnknown(error, {
        correlationId: req.headers['x-correlation-id'] as string,
        userId: (req as any).user?.id,
        requestId: req.headers['x-request-id'] as string,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip
    });

    // Log the error
    logError(appError, req);

    // Send error response
    sendErrorResponse(appError, res);
}

/**
 * Log error with appropriate level
 */
function logError(error: AppError, req: Request): void {
    const logContext = {
        correlationId: req.headers['x-correlation-id'] as string,
        userId: (req as any).user?.id,
        requestId: req.headers['x-request-id'] as string,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        statusCode: error.statusCode,
        errorName: error.name,
        isOperational: error.isOperational
    };

    if (error.statusCode >= 500) {
        // Server errors - log as error
        log.error(`Server Error: ${error.message}`, {
            ...logContext,
            error: error.toJSON()
        });
    } else if (error.statusCode >= 400) {
        // Client errors - log as warning
        log.warn(`Client Error: ${error.message}`, logContext);
    } else {
        // Other errors - log as info
        log.info(`Error: ${error.message}`, logContext);
    }
}

/**
 * Send formatted error response
 */
function sendErrorResponse(error: AppError, res: Response): void {
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    
    const errorResponse: ErrorResponse = {
        success: false,
        error: {
            message: error.getPublicMessage(),
            code: error.name,
            statusCode: error.statusCode,
            correlationId: error.context?.correlationId as string,
            timestamp: error.timestamp.toISOString()
        }
    };

    // Add detailed error information in development
    if (isDevelopment && error.isOperational) {
        errorResponse.error.details = {
            stack: error.stack,
            context: error.context,
            ...getErrorSpecificDetails(error)
        };
    }

    // Set appropriate headers
    res.status(error.statusCode);
    
    // Add rate limit headers if applicable
    if (error.name === 'RateLimitError') {
        const rateLimitError = error as any;
        if (rateLimitError.retryAfter) {
            res.set('Retry-After', rateLimitError.retryAfter.toString());
        }
        if (rateLimitError.limit) {
            res.set('X-RateLimit-Limit', rateLimitError.limit.toString());
        }
        if (rateLimitError.remaining !== undefined) {
            res.set('X-RateLimit-Remaining', rateLimitError.remaining.toString());
        }
    }

    res.json(errorResponse);
}

/**
 * Get error-specific details for development
 */
function getErrorSpecificDetails(error: AppError): Record<string, unknown> {
    const details: Record<string, unknown> = {};

    // Add specific error details based on error type
    if ('field' in error) {
        details.field = (error as any).field;
        details.value = (error as any).value;
    }

    if ('resource' in error) {
        details.resource = (error as any).resource;
        details.resourceId = (error as any).resourceId;
    }

    if ('requiredPermission' in error) {
        details.requiredPermission = (error as any).requiredPermission;
        details.userPermissions = (error as any).userPermissions;
    }

    if ('service' in error) {
        details.service = (error as any).service;
        details.endpoint = (error as any).endpoint;
    }

    return details;
}

/**
 * Handle 404 errors for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
    const error = new (require('../utils/errors').NotFoundError)(
        `Route ${req.method} ${req.path} not found`,
        'route',
        `${req.method} ${req.path}`,
        {
            correlationId: req.headers['x-correlation-id'] as string,
            method: req.method,
            url: req.url
        }
    );

    next(error);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
    fn: (req: T, res: U, next: NextFunction) => Promise<void>
) {
    return (req: T, res: U, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Handle unhandled promise rejections
 */
export function handleUnhandledRejection(): void {
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
        log.error('💥 Unhandled Promise Rejection', {
            reason: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined,
            promise: promise.toString()
        });

        // Graceful shutdown
        process.exit(1);
    });
}

/**
 * Handle uncaught exceptions
 */
export function handleUncaughtException(): void {
    process.on('uncaughtException', (error: Error) => {
        log.error('💥 Uncaught Exception', {
            error: error.message,
            stack: error.stack
        });

        // Graceful shutdown
        process.exit(1);
    });
}