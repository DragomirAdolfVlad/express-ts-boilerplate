import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Main application entry point
 * This is a placeholder that will be replaced with the actual Express app
 */
async function main(): Promise<void> {
    console.log('🚀 Express TypeScript Boilerplate');
    console.log('📦 Project foundation setup complete');
    console.log('🔧 Ready for development');
    
    // Placeholder for Express app initialization
    const port = process.env.PORT ?? 3000;
    console.log(`🌐 Server will run on port ${port}`);
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