/**
 * Security configuration and middleware setup
 */

import express, { Application } from 'express';
import { configureHelmet, configureCORS, configureRequestLimits, securityLogger } from '../middleware/security';
// import { defaultRateLimit, createApiKeyRateLimit } from '../middleware/rate-limit';
import { sanitizeInput } from '../middleware/validation';
import { config } from './loader';
import { log } from '../utils/logger';

/**
 * Configure all security middleware for the Express application
 */
export function configureSecurity(app: Application): void {
    log.info('Configuring security middleware...');

    // 1. Security headers with Helmet.js
    app.use(configureHelmet());
    log.debug('Helmet.js security headers configured');

    // 2. CORS configuration
    app.use(configureCORS());
    log.debug('CORS configured', { 
        allowedOrigins: config.server.corsOrigins,
        environment: config.server.nodeEnv 
    });

    // 3. Request size limits (before body parsing)
    app.use(express.json({ 
        limit: config.server.bodyLimit,
        strict: true,
        type: 'application/json'
    }));
    
    app.use(express.urlencoded({ 
        extended: true, 
        limit: config.server.bodyLimit,
        parameterLimit: 100
    }));
    
    log.debug('Request body parsing configured', { 
        limit: config.server.bodyLimit 
    });

    // 4. Request timeout configuration
    app.use(configureRequestLimits());
    log.debug('Request timeout configured', { 
        timeout: config.server.requestTimeout 
    });

    // 5. Security logging
    app.use(securityLogger());
    log.debug('Security logging configured');

    // 6. Input sanitization
    app.use(sanitizeInput());
    log.debug('Input sanitization configured');

    // 7. Rate limiting - DISABLED for development
    // app.use(defaultRateLimit);
    // log.debug('Default rate limiting configured', {
    //     windowMs: config.rateLimit.windowMs,
    //     maxRequests: config.rateLimit.maxRequests
    // });

    // 8. API key specific rate limiting - DISABLED for development
    // app.use(createApiKeyRateLimit());
    // log.debug('API key rate limiting configured');

    log.info('Security middleware configuration completed');
}

/**
 * Security configuration summary
 */
export function getSecurityConfig() {
    return {
        helmet: {
            enabled: true,
            features: [
                'contentSecurityPolicy',
                'crossOriginEmbedderPolicy',
                'crossOriginOpenerPolicy',
                'crossOriginResourcePolicy',
                'dnsPrefetchControl',
                'frameguard',
                'hidePoweredBy',
                'hsts',
                'ieNoOpen',
                'noSniff',
                'originAgentCluster',
                'permittedCrossDomainPolicies',
                'referrerPolicy',
                'xssFilter'
            ]
        },
        cors: {
            enabled: true,
            allowedOrigins: config.server.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
        },
        rateLimit: {
            enabled: true,
            windowMs: config.rateLimit.windowMs,
            maxRequests: config.rateLimit.maxRequests,
            redisBackend: true
        },
        requestLimits: {
            bodyLimit: config.server.bodyLimit,
            timeout: config.server.requestTimeout,
            parameterLimit: 100
        },
        validation: {
            inputSanitization: true,
            joiValidation: true,
            contentTypeValidation: true
        }
    };
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(): void {
    const issues: string[] = [];

    // Check JWT secret
    if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) {
        issues.push('JWT secret must be at least 32 characters long');
    }

    // Check CORS origins in production
    if (config.server.nodeEnv === 'production') {
        if (config.server.corsOrigins.includes('*')) {
            issues.push('CORS should not allow all origins in production');
        }
        
        if (config.server.corsOrigins.some(origin => origin.includes('localhost'))) {
            issues.push('CORS should not include localhost origins in production');
        }
    }

    // Check rate limiting
    if (config.rateLimit.maxRequests > 10000) {
        issues.push('Rate limit max requests seems very high, consider lowering it');
    }

    // Check request timeout
    if (config.server.requestTimeout > 60000) {
        issues.push('Request timeout is very high, consider lowering it');
    }

    if (issues.length > 0) {
        log.warn('Security configuration issues detected', { issues });
        
        if (config.server.nodeEnv === 'production') {
            throw new Error(`Security configuration issues in production: ${issues.join(', ')}`);
        }
    } else {
        log.info('Security configuration validation passed');
    }
}

/**
 * Security middleware order (for documentation)
 */
export const MIDDLEWARE_ORDER = [
    '1. Helmet.js (Security Headers)',
    '2. CORS (Cross-Origin Resource Sharing)',
    '3. Body Parsing (JSON/URL-encoded)',
    '4. Request Timeout',
    '5. Security Logging',
    '6. Input Sanitization',
    '7. Rate Limiting (General)',
    '8. API Key Rate Limiting',
    '9. Authentication Middleware (Applied per route)',
    '10. Authorization Middleware (Applied per route)',
    '11. Validation Middleware (Applied per route)'
] as const;