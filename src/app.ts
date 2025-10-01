/**
 * Express application setup
 */

import express, { Application } from 'express';
import { configureSecurity } from './config/security';
import { setupSwagger } from './config/swagger';
import { initializeContainer } from './services/di/container';
import { errorHandler } from './middleware/error-handler';
import { correlationIdMiddleware, requestLoggingMiddleware } from './middleware/request-logger';
import { config } from './config/loader';
import { log } from './utils/logger';
// Removed old BlockchainTrackingService - now using MonadTrackerMain

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
export async function startServer(): Promise<void> {
    const app = createApp();
    const port = config.server.port;
    const host = config.server.host;

    // Start the HTTP server
    const server = app.listen(port, host, () => {
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

    // Initialize WMON price background service
    const { WmonPriceBackgroundService } = await import('./application/services/wmon-price-background.service');
    const priceService = new WmonPriceBackgroundService();
    
    try {
        await priceService.start();
        log.info('WMON price background service started successfully');
    } catch (error) {
        log.error('Failed to start WMON price service', {
            error: error instanceof Error ? error.message : String(error)
        });
    }

    // Initialize the new Monad tracker with token creation detection
    const { MonadTrackerMain } = await import('./infrastructure/blockchain/monad-tracker-main');
    const { JsonRpcProvider, WebSocketProvider } = await import('ethers');
    const { PrismaClient } = await import('@prisma/client');

    const httpProvider = new JsonRpcProvider(process.env['MONAD_RPC_URL'] || process.env['MONAD_HTTP_URL']);
    const wsProvider = new WebSocketProvider(process.env['MONAD_WS_URL']!);
    const prisma = new PrismaClient();

    let monadTracker: any = null;

    try {
        monadTracker = new MonadTrackerMain(httpProvider, wsProvider, prisma);
        await monadTracker.start();
        log.info('Monad tracker with token creation detection started successfully');
    } catch (error) {
        log.error('Failed to start Monad tracker', {
            error: error instanceof Error ? error.message : String(error)
        });
        // Don't exit - the API should still work even if tracker fails
    }

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
        log.info(`Received ${signal}, shutting down gracefully`);

        // Close HTTP server
        server.close(() => {
            log.info('HTTP server closed');
        });

        // Shutdown price service
        try {
            priceService.stop();
            log.info('WMON price service stopped');
        } catch (error) {
            log.error('Error stopping price service:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        // Shutdown Monad tracker
        try {
            if (monadTracker) {
                await monadTracker.stop();
                log.info('Monad tracker shutdown complete');
            }
        } catch (error) {
            log.error('Error during Monad tracker shutdown:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        process.exit(0);
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}