/**
 * User service with CRUD operations using Prisma
 */

import { PrismaClient, User, UserRole, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { getPrismaClient } from './database';
import { cacheService } from './cache';
import { log, LogContext } from '../utils/logger';
import { 
    ValidationError, 
    NotFoundError, 
    ConflictError, 
    DatabaseError,
    InternalServerError 
} from '../utils/errors';

/**
 * User service interfaces
 */
export interface CreateUserData {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole;
}

export interface UpdateUserData {
    email?: string;
    username?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    isActive?: boolean;
}

export interface UserFilter {
    email?: string;
    username?: string;
    role?: UserRole;
    isActive?: boolean;
    search?: string;
}

export interface PaginationOptions {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

import { HealthCheckableService, ServiceHealthCheck } from './service-base';

/**
 * User service implementation
 */
export class UserService extends HealthCheckableService {
    private prisma: PrismaClient;
    private readonly CACHE_PREFIX = 'user:';
    private readonly CACHE_TTL = 3600; // 1 hour

    constructor(prisma?: PrismaClient) {
        super('UserService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Create a new user
     */
    async createUser(data: CreateUserData, context?: LogContext): Promise<User> {
        const logger = log.child(context || {});
        
        try {
            logger.info('Creating new user', { email: data.email, username: data.username });

            // Validate input
            await this.validateUserData(data);

            // Check for existing user
            await this.checkUserExists(data.email, data.username);

            // Hash password
            const hashedPassword = await this.hashPassword(data.password);

            // Create user
            const user = await this.prisma.user.create({
                data: {
                    ...data,
                    password: hashedPassword,
                    role: data.role || UserRole.USER
                }
            });

            // Cache the user
            await this.cacheUser(user);

            logger.info('User created successfully', { 
                userId: user.id, 
                email: user.email,
                role: user.role 
            });

            return user;

        } catch (error) {
            logger.error('Failed to create user', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    const field = (error.meta?.['target'] as string[])?.join(', ') || 'field';
                    throw new ConflictError(`User with this ${field} already exists`, field, data);
                }
                throw new DatabaseError(`Database error: ${error.message}`, 'create', 'users', context);
            }

            if (error instanceof ValidationError || error instanceof ConflictError) {
                throw error;
            }

            throw new InternalServerError('Failed to create user', context);
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(id: string, context?: LogContext): Promise<User | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting user by ID', { userId: id });

            // Try cache first
            const cacheKey = `${this.CACHE_PREFIX}id:${id}`;
            const cachedUser = await cacheService.get<User>(cacheKey);
            
            if (cachedUser) {
                logger.debug('User found in cache', { userId: id });
                return cachedUser;
            }

            // Get from database
            const user = await this.prisma.user.findUnique({
                where: { id },
                include: {
                    apiKeys: {
                        select: {
                            id: true,
                            name: true,
                            isActive: true,
                            expiresAt: true,
                            createdAt: true
                        }
                    }
                }
            });

            if (user) {
                await this.cacheUser(user);
                logger.debug('User found in database', { userId: id });
            } else {
                logger.debug('User not found', { userId: id });
            }

            return user;

        } catch (error) {
            logger.error('Failed to get user by ID', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get user: ${error}`, 'findUnique', 'users', context);
        }
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string, context?: LogContext): Promise<User | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting user by email', { email });

            // Try cache first
            const cacheKey = `${this.CACHE_PREFIX}email:${email}`;
            const cachedUser = await cacheService.get<User>(cacheKey);
            
            if (cachedUser) {
                logger.debug('User found in cache', { email });
                return cachedUser;
            }

            // Get from database
            const user = await this.prisma.user.findUnique({
                where: { email }
            });

            if (user) {
                await this.cacheUser(user);
                logger.debug('User found in database', { email });
            } else {
                logger.debug('User not found', { email });
            }

            return user;

        } catch (error) {
            logger.error('Failed to get user by email', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get user: ${error}`, 'findUnique', 'users', context);
        }
    }

    /**
     * Get user by username
     */
    async getUserByUsername(username: string, context?: LogContext): Promise<User | null> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting user by username', { username });

            const user = await this.prisma.user.findUnique({
                where: { username }
            });

            if (user) {
                await this.cacheUser(user);
                logger.debug('User found', { username });
            } else {
                logger.debug('User not found', { username });
            }

            return user;

        } catch (error) {
            logger.error('Failed to get user by username', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get user: ${error}`, 'findUnique', 'users', context);
        }
    }

    /**
     * Update user
     */
    async updateUser(id: string, data: UpdateUserData, context?: LogContext): Promise<User> {
        const logger = log.child(context || {});
        
        try {
            logger.info('Updating user', { userId: id, fields: Object.keys(data) });

            // Check if user exists
            const existingUser = await this.getUserById(id, context);
            if (!existingUser) {
                throw new NotFoundError('User not found', 'user', id, context);
            }

            // Validate update data
            if (data.email || data.username) {
                await this.validateUserData(data as CreateUserData, id);
            }

            // Hash password if provided
            const updateData = { ...data };
            if (data.password) {
                updateData.password = await this.hashPassword(data.password);
            }

            // Update user
            const user = await this.prisma.user.update({
                where: { id },
                data: updateData
            });

            // Update cache
            await this.cacheUser(user);
            await this.invalidateUserCache(id, existingUser.email, existingUser.username);

            logger.info('User updated successfully', { 
                userId: user.id,
                updatedFields: Object.keys(data)
            });

            return user;

        } catch (error) {
            logger.error('Failed to update user', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof NotFoundError || error instanceof ValidationError) {
                throw error;
            }

            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    const field = (error.meta?.['target'] as string[])?.join(', ') || 'field';
                    throw new ConflictError(`User with this ${field} already exists`, field, data);
                }
                throw new DatabaseError(`Database error: ${error.message}`, 'update', 'users', context);
            }

            throw new InternalServerError('Failed to update user', context);
        }
    }

    /**
     * Delete user
     */
    async deleteUser(id: string, context?: LogContext): Promise<void> {
        const logger = log.child(context || {});
        
        try {
            logger.info('Deleting user', { userId: id });

            // Check if user exists
            const existingUser = await this.getUserById(id, context);
            if (!existingUser) {
                throw new NotFoundError('User not found', 'user', id, context);
            }

            // Delete user (cascade will handle API keys)
            await this.prisma.user.delete({
                where: { id }
            });

            // Remove from cache
            await this.invalidateUserCache(id, existingUser.email, existingUser.username);

            logger.info('User deleted successfully', { userId: id });

        } catch (error) {
            logger.error('Failed to delete user', error instanceof Error ? error : new Error(String(error)));
            
            if (error instanceof NotFoundError) {
                throw error;
            }

            throw new DatabaseError(`Failed to delete user: ${error}`, 'delete', 'users', context);
        }
    }

    /**
     * Get users with pagination and filtering
     */
    async getUsers(
        filter: UserFilter = {}, 
        pagination: PaginationOptions,
        context?: LogContext
    ): Promise<PaginatedResult<User>> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Getting users with pagination', { filter, pagination });

            const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
            const skip = (page - 1) * limit;

            // Build where clause
            const where: Prisma.UserWhereInput = {};
            
            if (filter.email) where.email = { contains: filter.email, mode: 'insensitive' };
            if (filter.username) where.username = { contains: filter.username, mode: 'insensitive' };
            if (filter.role) where.role = filter.role;
            if (filter.isActive !== undefined) where.isActive = filter.isActive;
            
            if (filter.search) {
                where.OR = [
                    { email: { contains: filter.search, mode: 'insensitive' } },
                    { username: { contains: filter.search, mode: 'insensitive' } },
                    { firstName: { contains: filter.search, mode: 'insensitive' } },
                    { lastName: { contains: filter.search, mode: 'insensitive' } }
                ];
            }

            // Get total count
            const total = await this.prisma.user.count({ where });

            // Get users
            const users = await this.prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: {
                    apiKeys: {
                        select: {
                            id: true,
                            name: true,
                            isActive: true,
                            expiresAt: true
                        }
                    }
                }
            });

            const totalPages = Math.ceil(total / limit);

            logger.debug('Users retrieved', { 
                count: users.length, 
                total, 
                page, 
                totalPages 
            });

            return {
                data: users,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            logger.error('Failed to get users', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get users: ${error}`, 'findMany', 'users', context);
        }
    }

    /**
     * Verify user password
     */
    async verifyPassword(user: User, password: string, context?: LogContext): Promise<boolean> {
        const logger = log.child(context || {});
        
        try {
            logger.debug('Verifying user password', { userId: user.id });
            
            const isValid = await bcrypt.compare(password, user.password);
            
            logger.debug('Password verification result', { 
                userId: user.id, 
                isValid 
            });
            
            return isValid;

        } catch (error) {
            logger.error('Failed to verify password', error instanceof Error ? error : new Error(String(error)));
            throw new InternalServerError('Failed to verify password', context);
        }
    }

    /**
     * Private helper methods
     */

    private async validateUserData(data: Partial<CreateUserData>, _excludeId?: string): Promise<void> {
        if (data.email && !this.isValidEmail(data.email)) {
            throw new ValidationError('Invalid email format', 'email', data.email);
        }

        if (data.username && !this.isValidUsername(data.username)) {
            throw new ValidationError('Invalid username format', 'username', data.username);
        }

        if (data.password && !this.isValidPassword(data.password)) {
            throw new ValidationError('Password must be at least 8 characters long', 'password');
        }
    }

    private async checkUserExists(email: string, username: string, excludeId?: string): Promise<void> {
        const existingUser = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username }
                ],
                ...(excludeId && { NOT: { id: excludeId } })
            }
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'email' : 'username';
            throw new ConflictError(`User with this ${field} already exists`, field, existingUser[field]);
        }
    }

    private async hashPassword(password: string): Promise<string> {
        const saltRounds = 12;
        return bcrypt.hash(password, saltRounds);
    }

    private async cacheUser(user: User): Promise<void> {
        const cachePromises = [
            cacheService.set(`${this.CACHE_PREFIX}id:${user.id}`, user, { ttl: this.CACHE_TTL }),
            cacheService.set(`${this.CACHE_PREFIX}email:${user.email}`, user, { ttl: this.CACHE_TTL }),
            cacheService.set(`${this.CACHE_PREFIX}username:${user.username}`, user, { ttl: this.CACHE_TTL })
        ];

        await Promise.all(cachePromises);
    }

    private async invalidateUserCache(id: string, email: string, username: string): Promise<void> {
        const cacheKeys = [
            `${this.CACHE_PREFIX}id:${id}`,
            `${this.CACHE_PREFIX}email:${email}`,
            `${this.CACHE_PREFIX}username:${username}`
        ];

        await cacheService.deleteMany(cacheKeys);
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private isValidUsername(username: string): boolean {
        const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
        return usernameRegex.test(username);
    }

    private isValidPassword(password: string): boolean {
        return password.length >= 8;
    }

    /**
     * Perform health check
     */
    async performHealthCheck(_context?: LogContext): Promise<ServiceHealthCheck> {
        const startTime = Date.now();
        
        try {
            // Test database connection by counting users
            await this.prisma.user.count();
            
            const latency = Date.now() - startTime;
            
            return {
                name: 'UserService',
                status: 'healthy',
                latency,
                details: {
                    database: 'connected',
                    operations: 'functional'
                }
            };

        } catch (error) {
            const latency = Date.now() - startTime;
            
            return {
                name: 'UserService',
                status: 'unhealthy',
                latency,
                error: error instanceof Error ? error.message : String(error),
                details: {
                    database: 'disconnected'
                }
            };
        }
    }
}