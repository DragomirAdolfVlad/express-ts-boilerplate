/**
 * Configuration module exports
 */

export * from './types';
export * from './schema';
export * from './loader';

// Export a singleton instance of the configuration
import { loadConfig } from './loader';

let configInstance: ReturnType<typeof loadConfig> | null = null;

/**
 * Get the application configuration singleton
 */
export function getConfig() {
    if (!configInstance) {
        configInstance = loadConfig();
    }
    return configInstance;
}

/**
 * Reset configuration instance (useful for testing)
 */
export function resetConfig() {
    configInstance = null;
}