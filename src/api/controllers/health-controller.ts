/**
 * Health check and metrics controller
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { getService } from '../../services/di/container';
import { UserService } from '../../services/database/user-service';
import { AuthService } from '../../services/database/auth-service';
import { getPrismaClient } from '../../services/database/database';
import { getRedisClient } from '../../services/redis/redis';
import { config } from '../../config/loader';
import { getSecurityConfig } from '../../config/security';

/**
 * Health check controller
 */
export class HealthController extends BaseController {
    private userService: UserService;
    private authService: AuthService;

    constructor() {
        super('HealthController');
        this.userService = getService<UserService>('userService');
        this.authService = getService<AuthService>('authService');
    }

    /**
     * GET /api/v1/health - Basic health check
     */
    public healthCheck = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Health check requested');

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env['npm_package_version'] || '1.0.0',
            environment: config.server.nodeEnv,
            node: process.version
        };

        const duration = timer.end();
        logger.info('Health check completed', { 
            status: health.status,
            duration: `${duration}ms`
        });

        this.success(res, health);
    });

    /**
     * GET /api/v1/health/detailed - Detailed health check with dependencies
     */
    public detailedHealthCheck = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Detailed health check requested');

        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkRedis(),
            this.checkServices()
        ]);

        const [databaseCheck, redisCheck, servicesCheck] = checks;

        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env['npm_package_version'] || '1.0.0',
            environment: config.server.nodeEnv,
            node: process.version,
            checks: {
                database: databaseCheck.status === 'fulfilled' ? databaseCheck.value : { status: 'unhealthy', error: (databaseCheck as any).reason?.message },
                redis: redisCheck.status === 'fulfilled' ? redisCheck.value : { status: 'unhealthy', error: (redisCheck as any).reason?.message },
                services: servicesCheck.status === 'fulfilled' ? servicesCheck.value : { status: 'unhealthy', error: (servicesCheck as any).reason?.message }
            }
        };

        // Determine overall status
        const hasUnhealthyChecks = Object.values(health.checks).some(check => check.status === 'unhealthy');
        if (hasUnhealthyChecks) {
            health.status = 'unhealthy';
        }

        const duration = timer.end();
        logger.info('Detailed health check completed', { 
            status: health.status,
            duration: `${duration}ms`
        });

        const statusCode = health.status === 'healthy' ? 200 : 503;
        this.success(res, health, statusCode);
    });

    /**
     * GET /api/v1/health/ready - Readiness probe
     */
    public readinessCheck = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        logger.info('Readiness check requested');

        try {
            // Check critical dependencies
            await this.checkDatabase();
            await this.checkRedis();

            const ready = {
                status: 'ready',
                timestamp: new Date().toISOString(),
                message: 'Service is ready to accept requests'
            };

            logger.info('Readiness check passed');
            this.success(res, ready);

        } catch (error) {
            logger.error('Readiness check failed', { 
                error: error instanceof Error ? error.message : String(error) 
            });

            const notReady = {
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                message: 'Service is not ready to accept requests',
                error: error instanceof Error ? error.message : String(error)
            };

            this.success(res, notReady, 503);
        }
    });

    /**
     * GET /api/v1/health/live - Liveness probe
     */
    public livenessCheck = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        logger.info('Liveness check requested');

        const live = {
            status: 'alive',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid
        };

        logger.info('Liveness check completed');
        this.success(res, live);
    });

    /**
     * GET /api/v1/metrics - Application metrics
     */
    public getMetrics = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Metrics requested');

        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                pid: process.pid
            },
            application: {
                version: process.env['npm_package_version'] || '1.0.0',
                environment: config.server.nodeEnv,
                port: config.server.port
            },
            security: getSecurityConfig()
        };

        const duration = timer.end();
        logger.info('Metrics retrieved', { duration: `${duration}ms` });

        this.success(res, metrics);
    });

    /**
     * GET /api/v1/info - Application information
     */
    public getInfo = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);

        logger.info('Application info requested');

        const info = {
            name: 'Express TypeScript Boilerplate',
            description: 'Production-ready Express.js TypeScript boilerplate for blockchain microservices',
            version: process.env['npm_package_version'] || '1.0.0',
            environment: config.server.nodeEnv,
            node: process.version,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            features: {
                authentication: ['JWT', 'API Keys'],
                authorization: ['RBAC', 'Permissions'],
                security: ['Helmet', 'CORS', 'Rate Limiting', 'Input Validation'],
                database: ['PostgreSQL', 'Prisma ORM'],
                cache: ['Redis'],
                logging: ['Winston', 'Structured Logging'],
                monitoring: ['Health Checks', 'Metrics'],
                documentation: ['OpenAPI/Swagger']
            },
            endpoints: {
                health: '/api/v1/health',
                metrics: '/api/v1/metrics',
                docs: '/api-docs'
            }
        };

        logger.info('Application info retrieved');
        this.success(res, info);
    });

    /**
     * Private helper methods
     */

    private async checkDatabase(): Promise<{ status: string; latency?: number; error?: string }> {
        const startTime = Date.now();
        
        try {
            const prisma = getPrismaClient();
            await prisma.$queryRaw`SELECT 1`;
            
            const latency = Date.now() - startTime;
            return { status: 'healthy', latency };

        } catch (error) {
            const latency = Date.now() - startTime;
            return { 
                status: 'unhealthy', 
                latency,
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    private async checkRedis(): Promise<{ status: string; latency?: number; error?: string }> {
        const startTime = Date.now();
        
        try {
            const redis = getRedisClient();
            await redis.ping();
            
            const latency = Date.now() - startTime;
            return { status: 'healthy', latency };

        } catch (error) {
            const latency = Date.now() - startTime;
            return { 
                status: 'unhealthy', 
                latency,
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    private async checkServices(): Promise<{ status: string; services: Record<string, any> }> {
        try {
            const [userServiceHealth, authServiceHealth] = await Promise.allSettled([
                this.userService.performHealthCheck(),
                this.authService.performHealthCheck()
            ]);

            const services = {
                userService: userServiceHealth.status === 'fulfilled' ? userServiceHealth.value : { status: 'unhealthy', error: (userServiceHealth as any).reason?.message },
                authService: authServiceHealth.status === 'fulfilled' ? authServiceHealth.value : { status: 'unhealthy', error: (authServiceHealth as any).reason?.message }
            };

            const hasUnhealthyServices = Object.values(services).some(service => service.status === 'unhealthy');
            const status = hasUnhealthyServices ? 'unhealthy' : 'healthy';

            return { status, services };

        } catch (error) {
            return { 
                status: 'unhealthy', 
                services: {},
                error: error instanceof Error ? error.message : String(error)
            } as any;
        }
    }
}