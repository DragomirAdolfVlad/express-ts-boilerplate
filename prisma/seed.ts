import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash an API key for storage
 */
async function hashApiKey(key: string): Promise<string> {
    return bcrypt.hash(key, 12);
}

/**
 * Seed development data
 */
async function seed() {
    console.log('🌱 Starting database seeding...');

    try {
        // Create admin user
        const adminPassword = await bcrypt.hash('admin123', 12);
        const adminUser = await prisma.user.upsert({
            where: { email: 'admin@example.com' },
            update: {},
            create: {
                email: 'admin@example.com',
                username: 'admin',
                password: adminPassword,
                firstName: 'Admin',
                lastName: 'User',
                role: UserRole.ADMIN,
                isActive: true
            }
        });

        console.log('✅ Created admin user:', adminUser.email);

        // Create regular user
        const userPassword = await bcrypt.hash('user123', 12);
        const regularUser = await prisma.user.upsert({
            where: { email: 'user@example.com' },
            update: {},
            create: {
                email: 'user@example.com',
                username: 'user',
                password: userPassword,
                firstName: 'Regular',
                lastName: 'User',
                role: UserRole.USER,
                isActive: true
            }
        });

        console.log('✅ Created regular user:', regularUser.email);

        // Create moderator user
        const moderatorPassword = await bcrypt.hash('moderator123', 12);
        const moderatorUser = await prisma.user.upsert({
            where: { email: 'moderator@example.com' },
            update: {},
            create: {
                email: 'moderator@example.com',
                username: 'moderator',
                password: moderatorPassword,
                firstName: 'Moderator',
                lastName: 'User',
                role: UserRole.MODERATOR,
                isActive: true
            }
        });

        console.log('✅ Created moderator user:', moderatorUser.email);

        // Create API keys for admin user
        const adminApiKey = generateApiKey();
        const adminHashedKey = await hashApiKey(adminApiKey);
        
        await prisma.apiKey.upsert({
            where: { key: adminApiKey },
            update: {},
            create: {
                name: 'Admin Development Key',
                key: adminApiKey,
                hashedKey: adminHashedKey,
                userId: adminUser.id,
                permissions: ['read', 'write', 'delete', 'admin'],
                isActive: true
            }
        });

        console.log('✅ Created admin API key:', adminApiKey);

        // Create API key for regular user
        const userApiKey = generateApiKey();
        const userHashedKey = await hashApiKey(userApiKey);
        
        await prisma.apiKey.upsert({
            where: { key: userApiKey },
            update: {},
            create: {
                name: 'User Development Key',
                key: userApiKey,
                hashedKey: userHashedKey,
                userId: regularUser.id,
                permissions: ['read', 'write'],
                isActive: true,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
            }
        });

        console.log('✅ Created user API key:', userApiKey);

        console.log('\n🎉 Database seeding completed successfully!');
        console.log('\n📋 Development Credentials:');
        console.log('Admin User: admin@example.com / admin123');
        console.log('Regular User: user@example.com / user123');
        console.log('Moderator User: moderator@example.com / moderator123');
        console.log('\n🔑 API Keys:');
        console.log('Admin API Key:', adminApiKey);
        console.log('User API Key:', userApiKey);

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        await seed();
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Execute if run directly
if (require.main === module) {
    main();
}

export { seed };