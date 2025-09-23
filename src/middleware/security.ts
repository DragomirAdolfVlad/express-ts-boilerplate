/**
 * Security middleware using Helmet.js and CORS
 */

import helmet from 'helmet';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/loader';
import { log } from '../utils/logger';

/**
 * Configure Helmet.js security headers
 */
export function configureHelmet() {
    return helmet({
        // Content Security Policy
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:"],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                manifestSrc: ["'self'"],
                workerSrc: ["'self'"]
            }
        },
        
        // Cross-Origin Embedder Policy
        crossOriginEmbedderPolicy: false, // Disable for API compatibility
        
        // Cross-Origin Opener Policy
        crossOriginOpenerPolicy: { policy: "same-origin" },
        
        // Cross-Origin Resource Policy
        crossOriginResourcePolicy: { policy: "cross-origin" },
        
        // DNS Prefetch Control
        dnsPrefetchControl: { allow: false },
        
        // Frame Options
        frameguard: { action: 'deny' },
        
        // Hide Powered-By header
        hidePoweredBy: true,
        
        // HTTP Strict Transport Security
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        
        // IE No Open
        ieNoOpen: true,
        
        // No Sniff
        noSniff: true,
        
        // Origin Agent Cluster
        originAgentCluster: true,
        
        // Permitted Cross-Domain Policies
        permittedCrossDomainPolicies: false,
        
        // Referrer Policy
        referrerPolicy: { policy: "no-referrer" },
        
        // X-XSS-Protection
        xssFilter: true
    });
}

/**
 * Configure CORS with environment-based whitelist
 */
export function configureCORS() {
    const corsOptions: cors.CorsOptions = {
        origin: (origin, callback) => {
            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) {
                return callback(null, true);
            }

            // Check if origin is in allowed list
            if (config.server.corsOrigins.includes(origin)) {
                return callback(null, true);
            }

            // In development, allow localhost with any port
            if (config.server.nodeEnv === 'development') {
                const localhostRegex = /^https?:\/\/localhost(:\d+)?$/;
                const localhostIpRegex = /^https?:\/\/127\.0\.0\.1(:\d+)?$/;
                
                if (localhostRegex.test(origin) || localhostIpRegex.test(origin)) {
                    return callback(null, true);
                }
            }

            log.warn('CORS blocked request', { 
                origin, 
                allowedOrigins: config.server.corsOrigins,
                environment: config.server.nodeEnv
            });

            callback(new Error('Not allowed by CORS'));
        },
        
        credentials: true, // Allow cookies and authorization headers
        
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        
        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'X-API-Key',
            'X-Request-ID',
            'Cache-Control'
        ],
        
        exposedHeaders: [
            'X-Request-ID',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset'
        ],
        
        maxAge: 86400 // 24 hours preflight cache
    };

    return cors(corsOptions);
}

/**
 * Request size and timeout middleware
 */
export function configureRequestLimits() {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Set request timeout
        const timeout = config.server.requestTimeout;
        
        const timeoutId = setTimeout(() => {
            if (!res.headersSent) {
                log.warn('Request timeout', {
                    method: req.method,
                    path: req.path,
                    timeout,
                    requestId: req.headers['x-request-id'] as string,
                    userAgent: req.headers['user-agent'],
                    ip: req.ip
                });

                res.status(408).json({
                    error: {
                        code: 'REQUEST_TIMEOUT',
                        message: 'Request timeout',
                        timestamp: new Date().toISOString(),
                        requestId: req.headers['x-request-id']
                    }
                });
            }
        }, timeout);

        // Clear timeout when response finishes
        res.on('finish', () => {
            clearTimeout(timeoutId);
        });

        res.on('close', () => {
            clearTimeout(timeoutId);
        });

        next();
    };
}

/**
 * Security logging middleware
 */
export function securityLogger() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        // Log security-relevant headers
        const securityHeaders = {
            userAgent: req.headers['user-agent'],
            origin: req.headers.origin,
            referer: req.headers.referer,
            xForwardedFor: req.headers['x-forwarded-for'],
            xRealIp: req.headers['x-real-ip'],
            authorization: req.headers.authorization ? '[REDACTED]' : undefined,
            apiKey: req.headers['x-api-key'] ? '[REDACTED]' : undefined
        };

        log.debug('Security headers', {
            method: req.method,
            path: req.path,
            ip: req.ip,
            requestId: req.headers['x-request-id'] as string,
            headers: securityHeaders
        });

        next();
    };
}

/**
 * Content type validation middleware
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
    return (req: Request, res: Response, next: NextFunction): Response | void => {
        // Skip validation for GET, HEAD, and OPTIONS requests
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }

        const contentType = req.headers['content-type'];
        
        if (!contentType) {
            log.warn('Missing content-type header', {
                method: req.method,
                path: req.path,
                requestId: req.headers['x-request-id'] as string
            });

            return res.status(400).json({
                error: {
                    code: 'MISSING_CONTENT_TYPE',
                    message: 'Content-Type header is required',
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id']
                }
            });
        }

        const isAllowed = allowedTypes.some(type => 
            contentType.toLowerCase().includes(type.toLowerCase())
        );

        if (!isAllowed) {
            log.warn('Invalid content-type', {
                method: req.method,
                path: req.path,
                contentType,
                allowedTypes,
                requestId: req.headers['x-request-id'] as string
            });

            return res.status(415).json({
                error: {
                    code: 'UNSUPPORTED_MEDIA_TYPE',
                    message: `Unsupported content type. Allowed types: ${allowedTypes.join(', ')}`,
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id']
                }
            });
        }

        next();
    };
}