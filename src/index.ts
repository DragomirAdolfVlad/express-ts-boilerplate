/**
 * Application entry point
 */

import { startServer } from './app';
import { validateConfig } from './config/loader';
import { log } from './utils/logger';

// Validate configuration on startup
validateConfig();

// Start the server
(async () => {
    try {
        await startServer();
    } catch (error) {
        log.error('Failed to start server', {
            error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
    }
})();