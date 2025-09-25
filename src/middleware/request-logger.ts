import { Request, Response, NextFunction } from 'express';
import { createRequestLogger, LogContext } from '../utils/logger';
import { randomUUID } from 'crypto';

/**
 * Request/response logging middleware with correlation IDs
 */

// Extend Express Request interface
declare global {
    namespace Express {
        interface Request {
            correlationId: string;
            requestId: string;
            startTime: number;
            logger: ReturnType<typeof createRequestLogger>;
        }
    }
}

export interface RequestLogContext extends LogContext {
    method: string;
    url: string;
    userAgent?: string;
    ip: string;
    userId?: string;
    sessionId?: string;
}

/**
 * Generate correlation ID middleware
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Get correlation ID from header or generate new one
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Set correlation ID on request
    req.correlationId = correlationId;
    req.requestId = requestId;
    req.startTime = Date.now();

    // Set response headers
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('X-Request-ID', requestId);

    // Create request-scoped logger
    req.logger = createRequestLogger(correlationId, {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
    });

    next();
}

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    // Log incoming request
    const requestContext: RequestLogContext = {
        correlationId: req.correlationId,
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userId: (req as any).user?.id,
        sessionId: (req as any).session?.id,
        contentLength: req.headers['content-length'],
        contentType: req.headers['content-type']
    };

    req.logger.info('📥 Incoming request', requestContext);

    // Capture original res.end to log response
    const originalEnd = res.end;

    // Override res.json to capture response body
    const originalJson = res.json;
    res.json = function(body: any) {
        return originalJson.call(this, body);
    };

    // Override res.end to log response
    res.end = function(chunk?: any, encoding?: any) {
        const duration = Date.now() - startTime;
        
        const responseContext = {
            ...requestContext,
            statusCode: res.statusCode,
            duration,
            responseSize: res.get('content-length') || (chunk ? chunk.length : 0),
            responseTime: `${duration}ms`
        };

        // Log response based on status code
        if (res.statusCode >= 500) {
            req.logger.error('📤 Response sent', responseContext);
        } else if (res.statusCode >= 400) {
            req.logger.warn('📤 Response sent', responseContext);
        } else {
            req.logger.info('📤 Response sent', responseContext);
        }

        // Log slow requests
        if (duration > 1000) {
            req.logger.warn('🐌 Slow request detected', {
                ...responseContext,
                threshold: '1000ms'
            });
        }

        // Call original end
        return originalEnd.call(this, chunk, encoding);
    };

    next();
}

/**
 * User context middleware (to be used after authentication)
 */
export function userContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const user = (req as any).user;
    
    if (user) {
        // Update logger with user context
        req.logger = req.logger.child({
            userId: user.id,
            userEmail: user.email,
            userRole: user.role
        });

        req.logger.debug('👤 User context added', {
            userId: user.id,
            userEmail: user.email,
            userRole: user.role
        });
    }

    next();
}

/**
 * Security headers logging middleware
 */
export function securityLoggingMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const securityHeaders = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'authorization': req.headers.authorization ? '[REDACTED]' : undefined,
        'cookie': req.headers.cookie ? '[REDACTED]' : undefined
    };

    // Log security-relevant information
    req.logger.debug('🔒 Security headers', {
        securityHeaders,
        protocol: req.protocol,
        secure: req.secure,
        hostname: req.hostname
    });

    next();
}

/**
 * Performance monitoring middleware
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    res.on('finish', () => {
        const endTime = process.hrtime.bigint();
        const endMemory = process.memoryUsage();
        
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        const memoryDelta = {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external
        };

        req.logger.debug('⚡ Performance metrics', {
            duration: `${duration.toFixed(2)}ms`,
            memoryDelta,
            cpuUsage: process.cpuUsage()
        });

        // Log performance warnings
        if (duration > 5000) {
            req.logger.warn('🚨 Very slow request', {
                duration: `${duration.toFixed(2)}ms`,
                threshold: '5000ms'
            });
        }

        if (memoryDelta.heapUsed > 50 * 1024 * 1024) { // 50MB
            req.logger.warn('🚨 High memory usage', {
                memoryIncrease: `${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)}MB`,
                threshold: '50MB'
            });
        }
    });

    next();
}

/**
 * Request size logging middleware
 */
export function requestSizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > 0) {
        req.logger.debug('📊 Request size', {
            contentLength,
            contentType: req.headers['content-type'],
            sizeFormatted: formatBytes(contentLength)
        });

        // Log large requests
        if (contentLength > 10 * 1024 * 1024) { // 10MB
            req.logger.warn('📦 Large request detected', {
                size: formatBytes(contentLength),
                threshold: '10MB'
            });
        }
    }

    next();
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}