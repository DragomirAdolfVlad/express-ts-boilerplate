import * as dotenv from 'dotenv';
import { AppConfig } from './types';
import { configSchema } from './schema';

/**
 * Load and validate configuration from environment variables
 */

// Load environment variables from .env file
dotenv.config();

/**
 * Parse comma-separated string into array
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
}

/**
 * Parse boolean from string
 */
function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
}

/**
 * Parse integer from string
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load raw configuration from environment variables
 */
function loadRawConfig(): any {
    return {
        server: {
            port: parseInteger(process.env['PORT'], 3000),
            host: process.env['HOST'] || 'localhost',
            nodeEnv: process.env['NODE_ENV'] || 'development',
            corsOrigins: parseArray(process.env['CORS_ORIGINS'], ['http://localhost:3000']),
            requestTimeout: parseInteger(process.env['REQUEST_TIMEOUT'], 30000),
            bodyLimit: process.env['BODY_LIMIT'] || '10mb'
        },
        database: {
            url: process.env['DATABASE_URL'],
            maxConnections: parseInteger(process.env['DB_MAX_CONNECTIONS'], 10),
            timeout: parseInteger(process.env['DB_TIMEOUT'], 30000),
            retryAttempts: parseInteger(process.env['DB_RETRY_ATTEMPTS'], 3),
            retryDelay: parseInteger(process.env['DB_RETRY_DELAY'], 1000)
        },
        redis: {
            host: process.env['REDIS_HOST'] || 'localhost',
            port: parseInteger(process.env['REDIS_PORT'], 6379),
            password: process.env['REDIS_PASSWORD'],
            db: parseInteger(process.env['REDIS_DB'], 0),
            maxRetriesPerRequest: parseInteger(process.env['REDIS_MAX_RETRIES'], 3),
            retryDelayOnFailover: parseInteger(process.env['REDIS_RETRY_DELAY'], 100),
            connectTimeout: parseInteger(process.env['REDIS_CONNECT_TIMEOUT'], 10000),
            commandTimeout: parseInteger(process.env['REDIS_COMMAND_TIMEOUT'], 5000),
            keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'app:',
            defaultTtl: parseInteger(process.env['REDIS_DEFAULT_TTL'], 3600)
        },
        auth: {
            jwtSecret: process.env['JWT_SECRET'],
            jwtExpiresIn: process.env['JWT_EXPIRES_IN'] || '1h',
            jwtRefreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
            bcryptRounds: parseInteger(process.env['BCRYPT_ROUNDS'], 12),
            apiKeyLength: parseInteger(process.env['API_KEY_LENGTH'], 64),
            sessionTimeout: parseInteger(process.env['SESSION_TIMEOUT'], 86400)
        },
        logging: {
            level: process.env['LOG_LEVEL'] || 'info',
            format: process.env['LOG_FORMAT'] || 'json',
            enableConsole: parseBoolean(process.env['LOG_ENABLE_CONSOLE'], true),
            enableFile: parseBoolean(process.env['LOG_ENABLE_FILE'], false),
            filePath: process.env['LOG_FILE_PATH'],
            maxFiles: parseInteger(process.env['LOG_MAX_FILES'], 5),
            maxSize: process.env['LOG_MAX_SIZE'] || '20m',
            enableJson: parseBoolean(process.env['LOG_ENABLE_JSON'], true)
        },
        rateLimit: {
            windowMs: parseInteger(process.env['RATE_LIMIT_WINDOW_MS'], 900000),
            maxRequests: parseInteger(process.env['RATE_LIMIT_MAX_REQUESTS'], 100),
            skipSuccessfulRequests: parseBoolean(process.env['RATE_LIMIT_SKIP_SUCCESS'], false),
            skipFailedRequests: parseBoolean(process.env['RATE_LIMIT_SKIP_FAILED'], false),
            standardHeaders: parseBoolean(process.env['RATE_LIMIT_STANDARD_HEADERS'], true),
            legacyHeaders: parseBoolean(process.env['RATE_LIMIT_LEGACY_HEADERS'], false)
        }
    };
}

/**
 * Load and validate configuration
 */
export function loadConfig(): AppConfig {
    const rawConfig = loadRawConfig();

    const { error, value } = configSchema.validate(rawConfig, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
    });

    if (error) {
        const errorMessages = error.details.map(detail => detail.message).join(', ');
        throw new Error(`Configuration validation failed: ${errorMessages}`);
    }

    return value as AppConfig;
}

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
    try {
        loadConfig();
        console.log('✅ Configuration validation passed');
    } catch (error) {
        console.error('❌ Configuration validation failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Global configuration instance
 */
export const config = loadConfig();