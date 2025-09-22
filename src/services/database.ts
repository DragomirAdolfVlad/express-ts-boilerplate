import { PrismaClient } from '@prisma/client';
import { getConfig } from '../config';

/**
 * Database service with Prisma client singleton
 */

let prismaInstance: PrismaClient | null = null;

/**
 * Get Prisma client singleton instance
 */
export function getPrismaClient(): PrismaClient {
    if (!prismaInstance) {
        const config = getConfig();
        
        prismaInstance = new PrismaClient({
            datasources: {
                db: {
                    url: config.database.url
                }
            },
            log: config.server.nodeEnv === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
        });

        // Handle graceful shutdown
        process.on('beforeExit', async () => {
            await prismaInstance?.$disconnect();
        });

        process.on('SIGINT', async () => {
            await prismaInstance?.$disconnect();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await prismaInstance?.$disconnect();
            process.exit(0);
        });
    }

    return prismaInstance;
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<boolean> {
    try {
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error instanceof Error ? error.message : error);
        return false;
    }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
    if (prismaInstance) {
        await prismaInstance.$disconnect();
        prismaInstance = null;
        console.log('🔌 Database disconnected');
    }
}

/**
 * Reset database connection (useful for testing)
 */
export function resetDatabaseConnection(): void {
    prismaInstance = null;
}