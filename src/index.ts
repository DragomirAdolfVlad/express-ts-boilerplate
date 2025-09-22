import { getConfig, validateConfig } from './config';

/**
 * Main application entry point
 * This is a placeholder that will be replaced with the actual Express app
 */
async function main(): Promise<void> {
    console.log('🚀 Express TypeScript Boilerplate');

    // Validate configuration at startup
    validateConfig();

    // Get configuration
    const config = getConfig();

    console.log('📦 Project foundation setup complete');
    console.log('🔧 Ready for development');
    console.log(`🌐 Server will run on port ${config.server.port}`);
    console.log(`🗄️  Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
    console.log(`📊 Environment: ${config.server.nodeEnv}`);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Start the application
main().catch((error: unknown) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});