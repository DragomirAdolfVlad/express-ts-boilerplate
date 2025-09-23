/**
 * Input validation middleware using Joi schemas
 */

import { Request, Response, NextFunction } from 'express';
import * as Joi from 'joi';
import { log } from '../utils/logger';
import { ValidationError } from '../utils/errors';

/**
 * Validation target types
 */
export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

/**
 * Validation options
 */
export interface ValidationOptions {
    abortEarly?: boolean;
    allowUnknown?: boolean;
    stripUnknown?: boolean;
    skipOnError?: boolean;
}

/**
 * Create validation middleware for request data
 */
export function validate(
    schema: Joi.ObjectSchema,
    target: ValidationTarget = 'body',
    options: ValidationOptions = {}
) {
    const opts: ValidationOptions = {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        skipOnError: false,
        ...options
    };

    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            const data = req[target];
            
            const { error, value } = schema.validate(data, opts);

            if (error) {
                const validationErrors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context?.value
                }));

                log.warn('Validation failed', {
                    target,
                    errors: validationErrors,
                    requestId: req.headers['x-request-id'] as string,
                    method: req.method,
                    path: req.path
                });

                const validationError = new ValidationError(
                    `Validation failed for ${target}`,
                    validationErrors[0]?.field,
                    validationErrors[0]?.value
                );

                // Add all validation errors to the error object
                (validationError as any).details = validationErrors;

                return next(validationError);
            }

            // Replace the original data with validated/sanitized data
            req[target] = value;

            log.debug('Validation passed', {
                target,
                requestId: req.headers['x-request-id'] as string
            });

            next();

        } catch (error) {
            log.error('Validation middleware error', {
                error: error instanceof Error ? error.message : String(error),
                target,
                requestId: req.headers['x-request-id'] as string
            });

            next(new ValidationError('Validation processing failed'));
        }
    };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
    // Pagination schema
    pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().optional(),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    }),

    // ID parameter schema
    id: Joi.object({
        id: Joi.string().required()
    }),

    // Search query schema
    search: Joi.object({
        q: Joi.string().min(1).max(100).optional(),
        filter: Joi.string().optional(),
        category: Joi.string().optional()
    }),

    // User creation schema
    createUser: Joi.object({
        email: Joi.string().email().required(),
        username: Joi.string().alphanum().min(3).max(30).required(),
        password: Joi.string().min(8).max(128).required(),
        firstName: Joi.string().min(1).max(50).optional(),
        lastName: Joi.string().min(1).max(50).optional(),
        roles: Joi.array().items(Joi.string()).default(['USER'])
    }),

    // User update schema
    updateUser: Joi.object({
        email: Joi.string().email().optional(),
        username: Joi.string().alphanum().min(3).max(30).optional(),
        password: Joi.string().min(8).max(128).optional(),
        firstName: Joi.string().min(1).max(50).optional(),
        lastName: Joi.string().min(1).max(50).optional(),
        isActive: Joi.boolean().optional()
    }),

    // Login schema
    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),

    // API key creation schema
    createApiKey: Joi.object({
        name: Joi.string().min(1).max(100).required(),
        permissions: Joi.array().items(Joi.string()).default([]),
        expiresAt: Joi.date().greater('now').optional(),
        rateLimit: Joi.object({
            requests: Joi.number().integer().min(1).max(100000).default(1000),
            windowMs: Joi.number().integer().min(1000).max(86400000).default(3600000) // 1 hour
        }).optional()
    }),

    // Refresh token schema
    refreshToken: Joi.object({
        refreshToken: Joi.string().required()
    })
};

/**
 * Validate request body
 */
export const validateBody = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
    validate(schema, 'body', options);

/**
 * Validate query parameters
 */
export const validateQuery = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
    validate(schema, 'query', options);

/**
 * Validate URL parameters
 */
export const validateParams = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
    validate(schema, 'params', options);

/**
 * Validate headers
 */
export const validateHeaders = (schema: Joi.ObjectSchema, options?: ValidationOptions) =>
    validate(schema, 'headers', options);

/**
 * Sanitize input data
 */
export function sanitizeInput() {
    return (req: Request, _res: Response, next: NextFunction): void => {
        // Sanitize common injection patterns
        const sanitize = (obj: any): any => {
            if (typeof obj === 'string') {
                return obj
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
                    .replace(/javascript:/gi, '') // Remove javascript: protocol
                    .replace(/on\w+\s*=/gi, '') // Remove event handlers
                    .trim();
            }
            
            if (Array.isArray(obj)) {
                return obj.map(sanitize);
            }
            
            if (obj && typeof obj === 'object') {
                const sanitized: any = {};
                for (const [key, value] of Object.entries(obj)) {
                    sanitized[key] = sanitize(value);
                }
                return sanitized;
            }
            
            return obj;
        };

        // Sanitize request data
        if (req.body) {
            req.body = sanitize(req.body);
        }
        
        if (req.query) {
            req.query = sanitize(req.query);
        }

        log.debug('Input sanitization completed', {
            requestId: req.headers['x-request-id'] as string
        });

        next();
    };
}

/**
 * File upload validation
 */
export function validateFileUpload(options: {
    maxSize?: number;
    allowedMimeTypes?: string[];
    maxFiles?: number;
} = {}) {
    const opts = {
        maxSize: 10 * 1024 * 1024, // 10MB default
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
        maxFiles: 5,
        ...options
    };

    return (req: Request, res: Response, next: NextFunction): Response | void => {
        // This would be used with multer or similar file upload middleware
        // For now, just validate content-length for file uploads
        
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        
        if (contentLength > opts.maxSize) {
            log.warn('File upload too large', {
                contentLength,
                maxSize: opts.maxSize,
                requestId: req.headers['x-request-id'] as string
            });

            return res.status(413).json({
                error: {
                    code: 'FILE_TOO_LARGE',
                    message: `File size exceeds maximum allowed size of ${opts.maxSize} bytes`,
                    timestamp: new Date().toISOString(),
                    requestId: req.headers['x-request-id']
                }
            });
        }

        next();
    };
}

/**
 * Rate limit validation for specific endpoints
 */
export function validateRateLimit(maxRequests: number, windowMs: number) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        // This would integrate with the rate limiting middleware
        // For now, just add metadata to the request
        
        (req as any).rateLimitConfig = {
            maxRequests,
            windowMs
        };

        next();
    };
}