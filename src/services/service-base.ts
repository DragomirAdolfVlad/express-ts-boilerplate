/**
 * Base service class with common functionality
 */

import { log, LogContext } from '../utils/logger';
import { InternalServerError, DatabaseError } from '../utils/errors';
import { Prisma } from '@prisma/client';

/**
 * Base service class with error handling and logging
 */
export abstract class BaseService {
    protected readonly serviceName: string;

    constructor(serviceName: string) {
        this.serviceName = serviceName;
    }

    /**
     * Create service-scoped logger
     */
    public createLogger(context?: LogContext): ReturnType<typeof log.child> {
        return log.child({
            service: this.serviceName,
            ...context
        });
    }

    /**
     * Handle database errors with proper error conversion
     */
    public handleDatabaseError(
        error: unknown,
        operation: string,
        table: string,
        context?: LogContext
    ): never {
        const logger = this.createLogger(context);

        logger.error(`Database operation failed`, {
            operation,
            table,
            error: error instanceof Error ? error.message : String(error)
        });

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            throw new DatabaseError(
                `Database ${operation} failed: ${error.message}`,
                operation,
                table,
                context
            );
        }

        if (error instanceof Prisma.PrismaClientUnknownRequestError) {
            throw new DatabaseError(
                `Unknown database error during ${operation}`,
                operation,
                table,
                context
            );
        }

        if (error instanceof Prisma.PrismaClientRustPanicError) {
            throw new DatabaseError(
                `Database panic during ${operation}`,
                operation,
                table,
                context
            );
        }

        if (error instanceof Prisma.PrismaClientInitializationError) {
            throw new DatabaseError(
                `Database initialization error during ${operation}`,
                operation,
                table,
                context
            );
        }

        if (error instanceof Prisma.PrismaClientValidationError) {
            throw new DatabaseError(
                `Database validation error during ${operation}: ${error.message}`,
                operation,
                table,
                context
            );
        }

        // Generic error handling
        throw new InternalServerError(
            `Service operation failed: ${error instanceof Error ? error.message : String(error)}`,
            context
        );
    }

    /**
     * Execute operation with error handling and logging
     */
    public async executeOperation<T>(
        operationName: string,
        operation: () => Promise<T>,
        context?: LogContext
    ): Promise<T> {
        const logger = this.createLogger(context);
        const startTime = Date.now();

        try {
            logger.debug(`Starting ${operationName}`, { operation: operationName });

            const result = await operation();

            const duration = Date.now() - startTime;
            logger.debug(`Completed ${operationName}`, {
                operation: operationName,
                duration: `${duration}ms`
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Failed ${operationName}`, {
                operation: operationName,
                duration: `${duration}ms`,
                error: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }

    /**
     * Validate required parameters
     */
    public validateRequired(params: Record<string, any>, requiredFields: string[]): void {
        const missing = requiredFields.filter(field =>
            params[field] === undefined || params[field] === null || params[field] === ''
        );

        if (missing.length > 0) {
            throw new InternalServerError(`Missing required parameters: ${missing.join(', ')}`);
        }
    }

    /**
     * Log service metrics
     */
    public logMetrics(operation: string, metrics: Record<string, any>, context?: LogContext): void {
        const logger = this.createLogger(context);

        logger.info(`Service metrics`, {
            operation,
            service: this.serviceName,
            metrics,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Create performance timer
     */
    public createTimer(operation: string, context?: LogContext) {
        const logger = this.createLogger(context);
        const startTime = Date.now();

        return {
            end: (additionalData?: Record<string, any>) => {
                const duration = Date.now() - startTime;

                logger.debug(`Operation completed`, {
                    operation,
                    duration: `${duration}ms`,
                    ...additionalData
                });

                // Log slow operations
                if (duration > 1000) {
                    logger.warn(`Slow operation detected`, {
                        operation,
                        duration: `${duration}ms`,
                        threshold: '1000ms',
                        ...additionalData
                    });
                }

                return duration;
            }
        };
    }
}

/**
 * Service health check interface
 */
export interface ServiceHealthCheck {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    error?: string;
    details?: Record<string, any>;
}

/**
 * Base service with health check capability
 */
export abstract class HealthCheckableService extends BaseService {
    /**
     * Perform health check
     */
    abstract performHealthCheck(context?: LogContext): Promise<ServiceHealthCheck>;

    /**
     * Get service status
     */
    async getStatus(context?: LogContext): Promise<ServiceHealthCheck> {
        const logger = this.createLogger(context);

        try {
            logger.debug('Performing health check', { service: this.serviceName });

            const result = await this.performHealthCheck(context);

            logger.debug('Health check completed', {
                service: this.serviceName,
                status: result.status,
                latency: result.latency
            });

            return result;

        } catch (error) {
            logger.error('Health check failed', {
                service: this.serviceName,
                error: error instanceof Error ? error.message : String(error)
            });

            return {
                name: this.serviceName,
                status: 'unhealthy',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}