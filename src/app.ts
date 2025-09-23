/**
 * Express application setup
 */

import express, { Application } from 'express';
import { configureSecurity } from './config/security';
import { setupSwagger } from './config/swagger';
import { initializeContainer } from './services/container';
import { errorHandler } from './middleware/error-handler';
import { correlationIdMiddleware, requestLoggingMiddleware } from './middleware/request-logger';
import { config } from './config/loader';
import { log } from './utils/logger';

/**
 * Create Express application
 */
export function createApp(): Application {
    const app = express();

    // Initialize services first (with error handling)
    try {
        initializeContainer();
        log.info('Service container initialized successfully');
    } catch (error) {
        log.error('Failed to initialize service container', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }

    // Request logging (before other middleware)
    app.use(correlationIdMiddleware);
    app.use(requestLoggingMiddleware);

    // Security middleware (CORS, Helmet, rate limiting, etc.)
    configureSecurity(app);

    // Import and setup API routes after container initialization
    const apiRoutes = require('./api/routes').default;
    app.use('/api', apiRoutes);

    // Setup Swagger documentation
    setupSwagger(app);

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            success: true,
            data: {
                name: 'Express TypeScript Boilerplate',
                version: '1.0.0',
                environment: config.server.nodeEnv,
                documentation: '/api-docs',
                api: '/api/v1',
                health: '/api/v1/health'
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id']
            }
        });
    });

    // Error handling (must be last)
    app.use(errorHandler);

    return app;
}

/**
 * Start the server
 */
export function startServer(): void {
    const app = createApp();
    const port = config.server.port;
    const host = config.server.host;

    app.listen(port, host, () => {
        log.info('Server started successfully', {
            port,
            host,
            environment: config.server.nodeEnv,
            endpoints: {
                api: `http://${host}:${port}/api/v1`,
                docs: `http://${host}:${port}/api-docs`,
                health: `http://${host}:${port}/api/v1/health`
            }
        });
    });
}

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}