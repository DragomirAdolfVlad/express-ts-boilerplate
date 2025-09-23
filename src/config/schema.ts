import * as Joi from 'joi';

/**
 * Joi validation schemas for configuration
 */

const serverSchema = Joi.object({
    port: Joi.number().port().default(3000),
    host: Joi.string().default('localhost'),
    nodeEnv: Joi.string().valid('development', 'production', 'test').default('development'),
    corsOrigins: Joi.array().items(Joi.string()).default(['http://localhost:3000']),
    requestTimeout: Joi.number().positive().default(30000),
    bodyLimit: Joi.string().default('10mb')
});

const databaseSchema = Joi.object({
    url: Joi.string().uri().required(),
    maxConnections: Joi.number().positive().default(10),
    timeout: Joi.number().positive().default(30000),
    retryAttempts: Joi.number().min(0).default(3),
    retryDelay: Joi.number().positive().default(1000)
});

const redisSchema = Joi.object({
    host: Joi.string().default('localhost'),
    port: Joi.number().port().default(6379),
    password: Joi.string().allow('').optional(),
    db: Joi.number().min(0).max(15).default(0),
    maxRetriesPerRequest: Joi.number().min(0).default(3),
    retryDelayOnFailover: Joi.number().positive().default(100),
    connectTimeout: Joi.number().positive().default(10000),
    commandTimeout: Joi.number().positive().default(5000),
    keyPrefix: Joi.string().default('app:'),
    defaultTtl: Joi.number().positive().default(3600)
});

const authSchema = Joi.object({
    jwtSecret: Joi.string().min(32).required(),
    jwtExpiresIn: Joi.string().default('1h'),
    jwtRefreshExpiresIn: Joi.string().default('7d'),
    bcryptRounds: Joi.number().min(10).max(15).default(12),
    apiKeyLength: Joi.number().min(32).max(128).default(64),
    sessionTimeout: Joi.number().positive().default(86400)
});

const loggingSchema = Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    format: Joi.string().valid('json', 'simple', 'combined').default('json'),
    enableConsole: Joi.boolean().default(true),
    enableFile: Joi.boolean().default(false),
    filePath: Joi.string().when('enableFile', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional()
    }),
    maxFiles: Joi.number().positive().default(5),
    maxSize: Joi.string().default('20m'),
    enableJson: Joi.boolean().default(true)
});

const rateLimitSchema = Joi.object({
    windowMs: Joi.number().positive().default(900000), // 15 minutes
    maxRequests: Joi.number().positive().default(100),
    skipSuccessfulRequests: Joi.boolean().default(false),
    skipFailedRequests: Joi.boolean().default(false),
    standardHeaders: Joi.boolean().default(true),
    legacyHeaders: Joi.boolean().default(false)
});

export const configSchema = Joi.object({
    server: serverSchema.required(),
    database: databaseSchema.required(),
    redis: redisSchema.required(),
    auth: authSchema.required(),
    logging: loggingSchema.required(),
    rateLimit: rateLimitSchema.required()
});