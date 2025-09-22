/**
 * Configuration type definitions for the application
 */

export interface ServerConfig {
    port: number;
    host: string;
    nodeEnv: string;
    corsOrigins: string[];
    requestTimeout: number;
    bodyLimit: string;
}

export interface DatabaseConfig {
    url: string;
    maxConnections: number;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    connectTimeout: number;
    commandTimeout: number;
    keyPrefix: string;
    defaultTtl: number;
}

export interface AuthConfig {
    jwtSecret: string;
    jwtExpiresIn: string;
    jwtRefreshExpiresIn: string;
    bcryptRounds: number;
    apiKeyLength: number;
    sessionTimeout: number;
}

export interface LoggingConfig {
    level: string;
    format: string;
    enableConsole: boolean;
    enableFile: boolean;
    filePath?: string;
    maxFiles: number;
    maxSize: string;
    enableJson: boolean;
}

export interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
    standardHeaders: boolean;
    legacyHeaders: boolean;
}

export interface AppConfig {
    server: ServerConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    auth: AuthConfig;
    logging: LoggingConfig;
    rateLimit: RateLimitConfig;
}