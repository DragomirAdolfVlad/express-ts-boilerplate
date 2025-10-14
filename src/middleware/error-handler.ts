import { Request, Response, NextFunction } from 'express';
import { AppError, createErrorFromUnknown } from '../utils/errors';
import { log } from '../utils/logger';

/**
 * Centralized error handling middleware
 */

/**
 * Task 9.3: Consistent error response format
 * Requirements: 9
 * 
 * All errors follow this format:
 * - success: false (always)
 * - error: { message, code, status }
 * - timestamp: ISO 8601 format
 */
export interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code: string;
        status: number;
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
    _next: NextFunction
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
 * Task 9.2: Enhanced error logging with comprehensive context
 * Requirements: 9
 */
function logError(error: AppError, req: Request): void {
    // Build comprehensive log context with request params, stack trace, and timestamp
    const logContext = {
        // Request identification
        correlationId: req.headers['x-correlation-id'] as string,
        requestId: req.headers['x-request-id'] as string,
        
        // User context
        userId: (req as any).user?.id,
        apiKeyId: (req as any).apiKey?.keyId,
        
        // Request details
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        params: req.params,
        
        // Client information
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        referer: req.headers['referer'],
        
        // Error details
        statusCode: error.statusCode,
        errorName: error.name,
        errorMessage: error.message,
        isOperational: error.isOperational,
        
        // Timestamp
        timestamp: new Date().toISOString(),
        
        // Stack trace (for server errors)
        ...(error.statusCode >= 500 && { stack: error.stack })
    };

    if (error.statusCode >= 500) {
        // Server errors - log as error with full details
        log.error(`Server Error: ${error.message}`, {
            ...logContext,
            error: error.toJSON(),
            // Include full error object for debugging
            fullError: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                context: error.context
            }
        });
    } else if (error.statusCode >= 400) {
        // Client errors - log as warning with request context
        log.warn(`Client Error: ${error.message}`, {
            ...logContext,
            // Include error-specific details
            errorDetails: getErrorSpecificDetails(error)
        });
    } else {
        // Other errors - log as info
        log.info(`Error: ${error.message}`, logContext);
    }
}

/**
 * Send formatted error response
 * Task 9.3: Consistent error response formatting
 * Requirements: 9
 * 
 * Ensures all errors follow consistent format:
 * - Include error code, message, and status
 * - Add timestamp to all error responses (ISO 8601)
 * - Include correlation ID for tracing
 */
function sendErrorResponse(error: AppError, res: Response): void {
    const isDevelopment = process.env['NODE_ENV'] === 'development';

    // Map error names to standardized error codes
    const errorCode = mapErrorNameToCode(error.name);

    const errorResponse: ErrorResponse = {
        success: false,
        error: {
            message: error.getPublicMessage(),
            code: errorCode,
            status: error.statusCode,
            correlationId: error.context?.correlationId as string,
            // Timestamp in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
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
 * Map error class names to standardized error codes
 * Task 9.3: Standardized error codes
 */
function mapErrorNameToCode(errorName: string): string {
    const errorCodeMap: Record<string, string> = {
        'ValidationError': 'VALIDATION_ERROR',
        'AuthenticationError': 'AUTHENTICATION_ERROR',
        'UnauthorizedError': 'UNAUTHORIZED',
        'AuthorizationError': 'AUTHORIZATION_ERROR',
        'ForbiddenError': 'FORBIDDEN',
        'NotFoundError': 'NOT_FOUND',
        'ConflictError': 'CONFLICT',
        'RateLimitError': 'RATE_LIMIT_EXCEEDED',
        'InternalServerError': 'INTERNAL_ERROR',
        'DatabaseError': 'DATABASE_ERROR',
        'ExternalServiceError': 'EXTERNAL_SERVICE_ERROR',
        'ServiceUnavailableError': 'SERVICE_UNAVAILABLE'
    };

    return errorCodeMap[errorName] || 'INTERNAL_ERROR';
}

/**
 * Get error-specific details for development
 */
function getErrorSpecificDetails(error: AppError): Record<string, unknown> {
    const details: Record<string, unknown> = {};
    const errorAny = error as unknown as Record<string, unknown>;

    // Add specific error details based on error type
    if ('field' in error) {
        details['field'] = errorAny['field'];
        details['value'] = errorAny['value'];
    }

    if ('resource' in error) {
        details['resource'] = errorAny['resource'];
        details['resourceId'] = errorAny['resourceId'];
    }

    if ('requiredPermission' in error) {
        details['requiredPermission'] = errorAny['requiredPermission'];
        details['userPermissions'] = errorAny['userPermissions'];
    }

    if ('service' in error) {
        details['service'] = errorAny['service'];
        details['endpoint'] = errorAny['endpoint'];
    }

    return details;
}

/**
 * Handle 404 errors for unmatched routes
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
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