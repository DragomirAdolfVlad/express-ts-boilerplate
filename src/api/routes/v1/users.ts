/**
 * User management routes - Version 1
 */

import { Router } from 'express';
import { UserController } from '../../controllers/user-controller';
import { 
    authenticate, 
    requireRoles, 
    requireSelfOrAdmin,
    // createRateLimit,
    // strictRateLimit 
} from '../../../middleware';
import { 
    validateBody, 
    validateQuery, 
    validateParams,
    commonSchemas 
} from '../../../middleware/validation';

const router = Router();
const userController = new UserController();

// Rate limiting configurations
// const userListRateLimit = createRateLimit({
//     windowMs: 15 * 60 * 1000,  // 15 minutes
//     maxRequests: 100           // 100 requests per 15 minutes
// });

// const userCreateRateLimit = createRateLimit({
//     windowMs: 15 * 60 * 1000,  // 15 minutes
//     maxRequests: 10            // 10 user creations per 15 minutes
// });

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: List users with pagination and filtering
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', 
    // userListRateLimit, // DISABLED for development
    authenticate,
    requireRoles('USER', 'ADMIN'),
    validateQuery(commonSchemas.pagination),
    userController.getUsers
);

/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: User already exists
 */
router.post('/', 
    // userCreateRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    validateBody(commonSchemas.createUser),
    userController.createUser
);

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Authentication required
 */
router.get('/me',
    authenticate,
    userController.getCurrentUser
);

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 */
router.put('/me',
    // strictRateLimit, // DISABLED for development
    authenticate,
    validateBody(commonSchemas.updateUser),
    userController.updateCurrentUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.get('/:id',
    authenticate,
    requireSelfOrAdmin(),
    validateParams(commonSchemas.id),
    userController.getUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: Update user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserRequest'
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.put('/:id',
    // strictRateLimit, // DISABLED for development
    authenticate,
    requireSelfOrAdmin(),
    validateParams(commonSchemas.id),
    validateBody(commonSchemas.updateUser),
    userController.updateUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: Delete user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: User deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
router.delete('/:id',
    // strictRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    validateParams(commonSchemas.id),
    userController.deleteUser
);

export default router;