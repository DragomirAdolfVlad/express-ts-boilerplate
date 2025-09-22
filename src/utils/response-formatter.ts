import { Response } from 'express';

/**
 * Consistent API response formatting utilities
 */

export interface SuccessResponse<T = any> {
    success: true;
    data: T;
    message?: string;
    meta?: ResponseMeta;
}

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

export interface ResponseMeta {
    correlationId?: string;
    requestId?: string;
    timestamp: string;
    version?: string;
    pagination?: PaginationMeta;
    performance?: PerformanceMeta;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface PerformanceMeta {
    duration: string;
    cached?: boolean;
    cacheHit?: boolean;
    dbQueries?: number;
}

/**
 * Response formatter class
 */
export class ResponseFormatter {
    /**
     * Send success response
     */
    static success<T>(
        res: Response,
        data: T,
        message?: string,
        statusCode: number = 200,
        meta?: Partial<ResponseMeta>
    ): void {
        const response: SuccessResponse<T> = {
            success: true,
            data,
            message,
            meta: {
                timestamp: new Date().toISOString(),
                correlationId: res.getHeader('X-Correlation-ID') as string,
                requestId: res.getHeader('X-Request-ID') as string,
                version: process.env['API_VERSION'] || '1.0.0',
                ...meta
            }
        };

        res.status(statusCode).json(response);
    }

    /**
     * Send created response (201)
     */
    static created<T>(
        res: Response,
        data: T,
        message: string = 'Resource created successfully',
        meta?: Partial<ResponseMeta>
    ): void {
        this.success(res, data, message, 201, meta);
    }

    /**
     * Send accepted response (202)
     */
    static accepted<T>(
        res: Response,
        data: T,
        message: string = 'Request accepted for processing',
        meta?: Partial<ResponseMeta>
    ): void {
        this.success(res, data, message, 202, meta);
    }

    /**
     * Send no content response (204)
     */
    static noContent(res: Response): void {
        res.status(204).end();
    }

    /**
     * Send paginated response
     */
    static paginated<T>(
        res: Response,
        data: T[],
        pagination: PaginationMeta,
        message?: string,
        meta?: Partial<ResponseMeta>
    ): void {
        this.success(res, data, message, 200, {
            ...meta,
            pagination
        });
    }

    /**
     * Send cached response
     */
    static cached<T>(
        res: Response,
        data: T,
        cacheHit: boolean = true,
        message?: string,
        meta?: Partial<ResponseMeta>
    ): void {
        // Set cache headers
        if (cacheHit) {
            res.setHeader('X-Cache', 'HIT');
        } else {
            res.setHeader('X-Cache', 'MISS');
        }

        this.success(res, data, message, 200, {
            ...meta,
            performance: {
                duration: meta?.performance?.duration || '0ms',
                ...meta?.performance,
                cached: true,
                cacheHit
            }
        });
    }
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
    page: number,
    limit: number,
    total: number
): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    
    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
}

/**
 * Create performance metadata
 */
export function createPerformanceMeta(
    startTime: number,
    dbQueries?: number,
    cached?: boolean,
    cacheHit?: boolean
): PerformanceMeta {
    const duration = Date.now() - startTime;
    
    return {
        duration: `${duration}ms`,
        dbQueries,
        cached,
        cacheHit
    };
}

/**
 * Validation error response helper
 */
export function sendValidationError(
    res: Response,
    errors: Array<{ field: string; message: string; value?: unknown }>,
    correlationId?: string
): void {
    const response: ErrorResponse = {
        success: false,
        error: {
            message: 'Validation failed',
            code: 'ValidationError',
            statusCode: 400,
            correlationId,
            timestamp: new Date().toISOString(),
            details: {
                errors
            }
        }
    };

    res.status(400).json(response);
}

/**
 * Rate limit response helper
 */
export function sendRateLimitError(
    res: Response,
    retryAfter: number,
    limit: number,
    remaining: number,
    correlationId?: string
): void {
    // Set rate limit headers
    res.setHeader('Retry-After', retryAfter.toString());
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', (Date.now() + retryAfter * 1000).toString());

    const response: ErrorResponse = {
        success: false,
        error: {
            message: 'Rate limit exceeded',
            code: 'RateLimitError',
            statusCode: 429,
            correlationId,
            timestamp: new Date().toISOString(),
            details: {
                retryAfter,
                limit,
                remaining
            }
        }
    };

    res.status(429).json(response);
}

/**
 * Health check response helper
 */
export function sendHealthCheck(
    res: Response,
    status: 'healthy' | 'degraded' | 'unhealthy',
    checks: Record<string, { status: string; latency?: number; error?: string }>,
    correlationId?: string
): void {
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    
    const response = {
        success: true,
        data: {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env['API_VERSION'] || '1.0.0',
            environment: process.env['NODE_ENV'] || 'development',
            checks
        },
        meta: {
            correlationId,
            timestamp: new Date().toISOString()
        }
    };

    res.status(statusCode).json(response);
}