/**
 * User management controller with CRUD operations
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { getService } from '../../services/di/container';
import { UserService, CreateUserData, UpdateUserData, UserFilter } from '../../services/database/user-service';
import { AuthenticatedRequest } from '../../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';

/**
 * User controller for user management endpoints
 */
export class UserController extends BaseController {
    private userService: UserService;

    constructor() {
        super('UserController');
        this.userService = getService<UserService>('userService');
    }

    /**
     * GET /api/v1/users - List users with pagination and filtering
     */
    public getUsers = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Getting users list');

        // Extract pagination and filters
        const pagination = this.getPagination(req);
        const filters = this.getFilters(req, ['email', 'username', 'isActive', 'search']);

        // Convert filters to UserFilter type
        const userFilter: UserFilter = {
            email: filters['email'],
            username: filters['username'],
            isActive: filters['isActive'] === 'true' ? true : filters['isActive'] === 'false' ? false : undefined,
            search: filters['search']
        };

        // Get users from service
        const result = await this.userService.getUsers(userFilter, pagination, { requestId: req.headers['x-request-id'] as string });

        const duration = timer.end();
        logger.info('Users retrieved successfully', {
            count: result.data.length,
            total: result.pagination.total,
            duration: `${duration}ms`
        });

        this.paginated(res, result.data, result.pagination);
    });

    /**
     * GET /api/v1/users/:id - Get specific user
     */
    public getUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const { id } = req.params;

        logger.info('Getting user by ID', { userId: id });

        const user = await this.userService.getUserById(id!, { requestId: req.headers['x-request-id'] as string });

        if (!user) {
            throw new NotFoundError('User not found', 'user', id);
        }

        // Remove password from response
        const { password: _, ...userResponse } = user;

        logger.info('User retrieved successfully', { userId: id });
        this.success(res, userResponse);
    });

    /**
     * POST /api/v1/users - Create new user
     */
    public createUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Creating new user');

        // Validate required fields
        this.validateRequired(req.body, ['email', 'username', 'password']);

        const userData: CreateUserData = {
            email: req.body.email,
            username: req.body.username,
            password: req.body.password,
            firstName: req.body.firstName,
            lastName: req.body.lastName
        };

        // Create user
        const user = await this.userService.createUser(userData, { requestId: req.headers['x-request-id'] as string });

        // Remove password from response
        const { password: _, ...userResponse } = user;

        const duration = timer.end();
        logger.info('User created successfully', {
            userId: user.id,
            email: user.email,
            duration: `${duration}ms`
        });

        this.created(res, userResponse);
    });

    /**
     * PUT /api/v1/users/:id - Update user
     */
    public updateUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const { id } = req.params;
        const authReq = req as AuthenticatedRequest;

        logger.info('Updating user', { userId: id });

        // Check if user can update this resource
        const userContext = this.getUserContext(req);
        const isAdmin = authReq.user?.roles?.includes('ADMIN') || authReq.apiKey?.permissions?.includes('ADMIN');
        
        if (!isAdmin && userContext.userId !== id) {
            throw new ForbiddenError('You can only update your own profile');
        }

        const updateData: UpdateUserData = {
            email: req.body.email,
            username: req.body.username,
            password: req.body.password,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            isActive: req.body.isActive
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key as keyof UpdateUserData] === undefined) {
                delete updateData[key as keyof UpdateUserData];
            }
        });

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError('No valid fields provided for update');
        }

        const user = await this.userService.updateUser(id!, updateData, { requestId: req.headers['x-request-id'] as string });

        // Remove password from response
        const { password: _, ...userResponse } = user;

        logger.info('User updated successfully', { userId: id });
        this.success(res, userResponse);
    });

    /**
     * DELETE /api/v1/users/:id - Delete user
     */
    public deleteUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const { id } = req.params;

        logger.info('Deleting user', { userId: id });

        await this.userService.deleteUser(id!, { requestId: req.headers['x-request-id'] as string });

        logger.info('User deleted successfully', { userId: id });
        this.noContent(res);
    });

    /**
     * GET /api/v1/users/me - Get current user profile
     */
    public getCurrentUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const userContext = this.getUserContext(req);

        if (!userContext.userId) {
            throw new ValidationError('User context not found');
        }

        logger.info('Getting current user profile', { userId: userContext.userId });

        const user = await this.userService.getUserById(userContext.userId, { requestId: req.headers['x-request-id'] as string });

        if (!user) {
            throw new NotFoundError('User not found', 'user', userContext.userId);
        }

        // Remove password from response
        const { password: _, ...userResponse } = user;

        logger.info('Current user profile retrieved', { userId: userContext.userId });
        this.success(res, userResponse);
    });

    /**
     * PUT /api/v1/users/me - Update current user profile
     */
    public updateCurrentUser = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const userContext = this.getUserContext(req);

        if (!userContext.userId) {
            throw new ValidationError('User context not found');
        }

        logger.info('Updating current user profile', { userId: userContext.userId });

        const updateData: UpdateUserData = {
            email: req.body.email,
            username: req.body.username,
            password: req.body.password,
            firstName: req.body.firstName,
            lastName: req.body.lastName
        };

        // Remove undefined fields and admin-only fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key as keyof UpdateUserData] === undefined) {
                delete updateData[key as keyof UpdateUserData];
            }
        });

        // Users cannot change their own active status
        delete updateData.isActive;

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError('No valid fields provided for update');
        }

        const user = await this.userService.updateUser(userContext.userId, updateData, { requestId: req.headers['x-request-id'] as string });

        // Remove password from response
        const { password: _, ...userResponse } = user;

        logger.info('Current user profile updated', { userId: userContext.userId });
        this.success(res, userResponse);
    });
}