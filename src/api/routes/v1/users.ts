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

// GET /users - List users with pagination and filtering
router.get('/', 
    // userListRateLimit, // DISABLED for development
    authenticate,
    requireRoles('USER', 'ADMIN'),
    validateQuery(commonSchemas.pagination),
    userController.getUsers
);

// POST /users - Create a new user
router.post('/', 
    // userCreateRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    validateBody(commonSchemas.createUser),
    userController.createUser
);

// GET /users/me - Get current user profile
router.get('/me',
    authenticate,
    userController.getCurrentUser
);

// PUT /users/me - Update current user profile
router.put('/me',
    // strictRateLimit, // DISABLED for development
    authenticate,
    validateBody(commonSchemas.updateUser),
    userController.updateCurrentUser
);

// GET /users/:id - Get user by ID
router.get('/:id',
    authenticate,
    requireSelfOrAdmin(),
    validateParams(commonSchemas.id),
    userController.getUser
);

// PUT /users/:id - Update user by ID
router.put('/:id',
    // strictRateLimit, // DISABLED for development
    authenticate,
    requireSelfOrAdmin(),
    validateParams(commonSchemas.id),
    validateBody(commonSchemas.updateUser),
    userController.updateUser
);

// DELETE /users/:id - Delete user by ID
router.delete('/:id',
    // strictRateLimit, // DISABLED for development
    authenticate,
    requireRoles('ADMIN'),
    validateParams(commonSchemas.id),
    userController.deleteUser
);

export default router;