/**
 * Rate limiting middleware with Redis backend and authentication integration
 */

import { Response, NextFunction } from 'express';
import { getRedisClient } from '../services/redis/redis';
import { AuthenticatedRequest } from './auth';
import { log } from '../utils/logger';
import { config } from '../config/loader';
import { RateLimitError } from '../utils/errors';

/**
 * Rate limit configuration
 */
export interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (req: AuthenticatedRequest) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    message?: string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
}



/**
 * Default key generator based on authentication
 */
function defaultKeyGenerator(req: AuthenticatedRequest): string {
    // Use user ID if authenticated via JWT
    if (req.user) {
        return `user:${req.user.id}`;
    }
    
    // Use API key ID if authenticated via API key
    if (req.apiKey) {
        return `apikey:${req.apiKey.keyId}`;
    }
    
    // Fall back to IP address for unauthenticated requests
    return `ip:${req.ip}`;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimit(options: Partial<RateLimitOptions> = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const opts: RateLimitOptions = {
        windowMs: options.windowMs || config.rateLimit.windowMs,
        maxRequests: options.maxRequests || config.rateLimit.maxRequests,
        keyGenerator: options.keyGenerator || defaultKeyGenerator,
        skipSuccessfulRequests: options.skipSuccessfulRequests || config.rateLimit.skipSuccessfulRequests,
        skipFailedRequests: options.skipFailedRequests || config.rateLimit.skipFailedRequests,
        message: options.message || 'Too many requests, please try again later',
        standardHeaders: options.standardHeaders !== undefined ? options.standardHeaders : config.rateLimit.standardHeaders,
        legacyHeaders: options.legacyHeaders !== undefined ? options.legacyHeaders : config.rateLimit.legacyHeaders
    };

    const redis = getRedisClient();

    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const key = opts.keyGenerator!(req);
            const windowStart = Math.floor(Date.now() / opts.windowMs) * opts.windowMs;
            const redisKey = `rate_limit:${key}:${windowStart}`;

            // Get current count
            const current = await redis.get(redisKey);
            const currentCount = current ? parseInt(current, 10) : 0;

            // Calculate rate limit info
            const resetTime = new Date(windowStart + opts.windowMs);
            const remaining = Math.max(0, opts.maxRequests - currentCount - 1);

            // Check if limit exceeded
            if (currentCount >= opts.maxRequests) {
                log.warn('Rate limit exceeded', {
                    key,
                    currentCount,
                    maxRequests: opts.maxRequests,
                    windowMs: opts.windowMs,
                    resetTime,
                    requestId: req.headers['x-request-id'] as string,
                    userAgent: req.headers['user-agent'],
                    ip: req.ip,
                    path: req.path,
                    method: req.method
                });

                // Set rate limit headers
                if (opts.standardHeaders) {
                    res.set({
                        'RateLimit-Limit': opts.maxRequests.toString(),
                        'RateLimit-Remaining': '0',
                        'RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
                    });
                }

                if (opts.legacyHeaders) {
                    res.set({
                        'X-RateLimit-Limit': opts.maxRequests.toString(),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
                    });
                }

                const retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
                const error = new RateLimitError(
                    opts.message!,
                    retryAfter,
                    opts.maxRequests,
                    0
                );

                return next(error);
            }

            // Increment counter
            const pipeline = redis.pipeline();
            pipeline.incr(redisKey);
            pipeline.expire(redisKey, Math.ceil(opts.windowMs / 1000));
            await pipeline.exec();

            // Set rate limit headers
            if (opts.standardHeaders) {
                res.set({
                    'RateLimit-Limit': opts.maxRequests.toString(),
                    'RateLimit-Remaining': remaining.toString(),
                    'RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
                });
            }

            if (opts.legacyHeaders) {
                res.set({
                    'X-RateLimit-Limit': opts.maxRequests.toString(),
                    'X-RateLimit-Remaining': remaining.toString(),
                    'X-RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
                });
            }

            log.debug('Rate limit check passed', {
                key,
                currentCount: currentCount + 1,
                maxRequests: opts.maxRequests,
                remaining,
                resetTime,
                requestId: req.headers['x-request-id'] as string
            });

            next();

        } catch (error) {
            log.error('Rate limiting error', {
                error: error instanceof Error ? error.message : String(error),
                requestId: req.headers['x-request-id'] as string
            });

            // On Redis error, allow request to proceed
            next();
        }
    };
}

/**
 * API key specific rate limiting
 */
export function createApiKeyRateLimit(): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const redis = getRedisClient();

    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Only apply to API key authenticated requests
            if (!req.apiKey) {
                return next();
            }

            // Get API key rate limit configuration
            const apiKey = req.apiKey as any; // Type assertion to access rateLimit
            const rateLimit = apiKey.rateLimit;

            if (!rateLimit || !rateLimit.requests || !rateLimit.windowMs) {
                return next();
            }

            const windowStart = Math.floor(Date.now() / rateLimit.windowMs) * rateLimit.windowMs;
            const redisKey = `api_rate_limit:${apiKey.keyId}:${windowStart}`;

            // Get current count
            const current = await redis.get(redisKey);
            const currentCount = current ? parseInt(current, 10) : 0;

            // Calculate rate limit info
            const resetTime = new Date(windowStart + rateLimit.windowMs);
            const remaining = Math.max(0, rateLimit.requests - currentCount - 1);

            // Check if limit exceeded
            if (currentCount >= rateLimit.requests) {
                log.warn('API key rate limit exceeded', {
                    keyId: apiKey.keyId,
                    currentCount,
                    maxRequests: rateLimit.requests,
                    windowMs: rateLimit.windowMs,
                    resetTime,
                    requestId: req.headers['x-request-id'] as string
                });

                // Set rate limit headers
                res.set({
                    'RateLimit-Limit': rateLimit.requests.toString(),
                    'RateLimit-Remaining': '0',
                    'RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
                });

                const retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
                const error = new RateLimitError(
                    'API key rate limit exceeded',
                    retryAfter,
                    rateLimit.requests,
                    0
                );

                return next(error);
            }

            // Increment counter
            const pipeline = redis.pipeline();
            pipeline.incr(redisKey);
            pipeline.expire(redisKey, Math.ceil(rateLimit.windowMs / 1000));
            await pipeline.exec();

            // Set rate limit headers
            res.set({
                'RateLimit-Limit': rateLimit.requests.toString(),
                'RateLimit-Remaining': remaining.toString(),
                'RateLimit-Reset': Math.ceil(resetTime.getTime() / 1000).toString()
            });

            log.debug('API key rate limit check passed', {
                keyId: apiKey.keyId,
                currentCount: currentCount + 1,
                maxRequests: rateLimit.requests,
                remaining,
                resetTime,
                requestId: req.headers['x-request-id'] as string
            });

            next();

        } catch (error) {
            log.error('API key rate limiting error', {
                error: error instanceof Error ? error.message : String(error),
                requestId: req.headers['x-request-id'] as string
            });

            // On Redis error, allow request to proceed
            next();
        }
    };
}

/**
 * Default rate limit middleware
 */
export const defaultRateLimit = createRateLimit();

/**
 * Strict rate limit for sensitive endpoints
 */
export const strictRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 requests per 15 minutes
    message: 'Too many requests to sensitive endpoint, please try again later'
});

/**
 * Lenient rate limit for public endpoints
 */
export const lenientRateLimit = createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // 1000 requests per 15 minutes
    message: 'Too many requests, please try again later'
});