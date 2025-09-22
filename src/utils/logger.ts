import winston from 'winston';
import { getConfig } from '../config';

/**
 * Structured logging service using Winston
 */

// Custom log levels
const customLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue'
    }
};

/**
 * Create Winston logger instance
 */
function createLogger(): winston.Logger {
    const config = getConfig();
    
    const formats: winston.Logform.Format[] = [
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.metadata({
            fillExcept: ['message', 'level', 'timestamp', 'label']
        })
    ];

    // Add JSON formatting for structured logs
    if (config.logging.enableJson) {
        formats.push(winston.format.json());
    } else {
        formats.push(
            winston.format.colorize({ all: true }),
            winston.format.printf(({ timestamp, level, message, metadata, stack }) => {
                let log = `${timestamp} [${level}]: ${message}`;
                
                if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
                    log += ` ${JSON.stringify(metadata)}`;
                }
                
                if (stack) {
                    log += `\n${stack}`;
                }
                
                return log;
            })
        );
    }

    const transports: winston.transport[] = [];

    // Console transport
    if (config.logging.enableConsole) {
        transports.push(
            new winston.transports.Console({
                level: config.logging.level,
                format: winston.format.combine(...formats)
            })
        );
    }

    // File transport
    if (config.logging.enableFile && config.logging.filePath) {
        transports.push(
            new winston.transports.File({
                filename: config.logging.filePath,
                level: config.logging.level,
                format: winston.format.combine(...formats),
                maxsize: parseSize(config.logging.maxSize),
                maxFiles: config.logging.maxFiles,
                tailable: true
            })
        );
    }

    return winston.createLogger({
        levels: customLevels.levels,
        transports,
        exitOnError: false,
        silent: process.env['NODE_ENV'] === 'test'
    });
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
    const units: Record<string, number> = {
        b: 1,
        k: 1024,
        m: 1024 * 1024,
        g: 1024 * 1024 * 1024
    };

    const match = size.toLowerCase().match(/^(\d+)([bkmg]?)$/);
    if (!match || !match[1]) return 20 * 1024 * 1024; // Default 20MB

    const value = parseInt(match[1]);
    const unit = match[2] || 'b';
    
    return value * (units[unit] || 1);
}

// Create singleton logger instance
const logger = createLogger();

// Add colors to Winston
winston.addColors(customLevels.colors);

/**
 * Logger interface with correlation ID support
 */
export interface LogContext {
    correlationId?: string;
    userId?: string;
    requestId?: string;
    sessionId?: string;
    [key: string]: unknown;
}

/**
 * Enhanced logger with context support
 */
class ContextualLogger {
    private baseLogger: winston.Logger;

    constructor(baseLogger: winston.Logger) {
        this.baseLogger = baseLogger;
    }

    /**
     * Create child logger with context
     */
    child(context: LogContext): ContextualLogger {
        const childLogger = this.baseLogger.child(context);
        return new ContextualLogger(childLogger);
    }

    /**
     * Log error message
     */
    error(message: string, meta?: LogContext | Error): void {
        if (meta instanceof Error) {
            this.baseLogger.error(message, { error: meta, stack: meta.stack });
        } else {
            this.baseLogger.error(message, meta);
        }
    }

    /**
     * Log warning message
     */
    warn(message: string, meta?: LogContext): void {
        this.baseLogger.warn(message, meta);
    }

    /**
     * Log info message
     */
    info(message: string, meta?: LogContext): void {
        this.baseLogger.info(message, meta);
    }

    /**
     * Log debug message
     */
    debug(message: string, meta?: LogContext): void {
        this.baseLogger.debug(message, meta);
    }

    /**
     * Log with custom level
     */
    log(level: string, message: string, meta?: LogContext): void {
        this.baseLogger.log(level, message, meta);
    }

    /**
     * Create performance timer
     */
    startTimer(_label: string): winston.Profiler {
        return this.baseLogger.startTimer();
    }

    /**
     * Log performance metrics
     */
    profile(label: string, meta?: LogContext): void {
        this.baseLogger.profile(label, meta);
    }
}

// Export singleton logger instance
export const log = new ContextualLogger(logger);

/**
 * Create request-scoped logger with correlation ID
 */
export function createRequestLogger(correlationId: string, additionalContext?: LogContext): ContextualLogger {
    return log.child({
        correlationId,
        ...additionalContext
    });
}

/**
 * Log application startup
 */
export function logStartup(port: number, environment: string): void {
    log.info('🚀 Application starting', {
        port,
        environment,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
    });
}

/**
 * Log application shutdown
 */
export function logShutdown(reason: string): void {
    log.info('🛑 Application shutting down', {
        reason,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
}

/**
 * Log unhandled errors
 */
export function logUnhandledError(error: Error, type: 'uncaughtException' | 'unhandledRejection'): void {
    log.error(`💥 ${type}`, {
        error: error.message,
        stack: error.stack,
        type,
        timestamp: new Date().toISOString()
    });
}