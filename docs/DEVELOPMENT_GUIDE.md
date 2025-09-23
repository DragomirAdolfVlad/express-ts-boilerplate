# Development Guide: Adding New Features

This guide explains the complete workflow for adding new features to the Express TypeScript Boilerplate. We'll use a simplified `TokenTrade` model as an example.

## 🏗️ Architecture Overview

The boilerplate follows a layered architecture with dependency injection:

```
┌─────────────────┐
│   API Routes    │ ← HTTP endpoints and middleware
├─────────────────┤
│   Controllers   │ ← Request/response handling
├─────────────────┤
│   Services      │ ← Business logic and data access
├─────────────────┤
│   Database      │ ← Prisma ORM and PostgreSQL
└─────────────────┘
```

## 📋 Complete Workflow

### Step 1: Database Model (Prisma Schema)

**File**: `prisma/schema.prisma`

Add your model to the existing schema:

```prisma
// TokenTrade model - standalone, no user relations
model TokenTrade {
    id           String      @id @default(cuid())
    fromToken    String      @map("from_token")
    toToken      String      @map("to_token")
    fromAmount   Decimal     @map("from_amount") @db.Decimal(18, 8)
    toAmount     Decimal     @map("to_amount") @db.Decimal(18, 8)
    exchangeRate Decimal     @map("exchange_rate") @db.Decimal(18, 8)
    status       TradeStatus @default(PENDING)
    txHash       String?     @map("tx_hash")
    createdAt    DateTime    @default(now()) @map("created_at")
    updatedAt    DateTime    @updatedAt @map("updated_at")

    @@map("token_trades")
}

enum TradeStatus {
    PENDING
    COMPLETED
    FAILED
}
```

**Commands to run:**
```bash
npx prisma migrate dev --name add-token-trades
npx prisma generate
```

**Why this step:**
- Defines the data structure
- Creates database tables
- Generates TypeScript types
- Handles database migrations

---

### Step 2: Service Layer

**File**: `src/services/database/token-trade-service.ts`

Create the service that handles business logic:

```typescript
/**
 * TokenTrade service with basic CRUD operations
 */

import { PrismaClient, TokenTrade, TradeStatus, Prisma } from '@prisma/client';
import { getPrismaClient } from './database';
import { log, LogContext } from '../../utils/logger';
import {
    ValidationError,
    NotFoundError,
    DatabaseError,
    InternalServerError
} from '../../utils/errors';
import { HealthCheckableService, ServiceHealthCheck } from './service-base';

export interface CreateTokenTradeData {
    fromToken: string;
    toToken: string;
    fromAmount: number;
    toAmount: number;
    exchangeRate: number;
}

export interface UpdateTokenTradeData {
    status?: TradeStatus;
    txHash?: string;
}

export class TokenTradeService extends HealthCheckableService {
    private prisma: PrismaClient;

    constructor(prisma?: PrismaClient) {
        super('TokenTradeService');
        this.prisma = prisma || getPrismaClient();
    }

    /**
     * Create a new token trade
     */
    async createTokenTrade(data: CreateTokenTradeData, context?: LogContext): Promise<TokenTrade> {
        const logger = log.child(context || {});

        try {
            logger.info('Creating new token trade', { 
                fromToken: data.fromToken,
                toToken: data.toToken,
                fromAmount: data.fromAmount
            });

            // Validate input
            this.validateTokenTradeData(data);

            // Create token trade
            const tokenTrade = await this.prisma.tokenTrade.create({
                data: {
                    ...data,
                    fromAmount: new Prisma.Decimal(data.fromAmount),
                    toAmount: new Prisma.Decimal(data.toAmount),
                    exchangeRate: new Prisma.Decimal(data.exchangeRate)
                }
            });

            logger.info('Token trade created successfully', {
                tradeId: tokenTrade.id
            });

            return tokenTrade;

        } catch (error) {
            logger.error('Failed to create token trade', error instanceof Error ? error : new Error(String(error)));

            if (error instanceof ValidationError) {
                throw error;
            }

            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                throw new DatabaseError(`Database error: ${error.message}`, 'create', 'token_trades', context);
            }

            throw new InternalServerError('Failed to create token trade', context);
        }
    }

    /**
     * Get token trade by ID
     */
    async getTokenTradeById(id: string, context?: LogContext): Promise<TokenTrade | null> {
        const logger = log.child(context || {});

        try {
            logger.debug('Getting token trade by ID', { tradeId: id });

            const tokenTrade = await this.prisma.tokenTrade.findUnique({
                where: { id }
            });

            if (tokenTrade) {
                logger.debug('Token trade found', { tradeId: id });
            } else {
                logger.debug('Token trade not found', { tradeId: id });
            }

            return tokenTrade;

        } catch (error) {
            logger.error('Failed to get token trade by ID', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get token trade: ${error}`, 'findUnique', 'token_trades', context);
        }
    }

    /**
     * Get all token trades with simple pagination
     */
    async getTokenTrades(page: number = 1, limit: number = 10, context?: LogContext): Promise<{
        data: TokenTrade[];
        total: number;
        page: number;
        totalPages: number;
    }> {
        const logger = log.child(context || {});

        try {
            logger.debug('Getting token trades', { page, limit });

            const skip = (page - 1) * limit;

            // Get total count and trades in parallel
            const [total, trades] = await Promise.all([
                this.prisma.tokenTrade.count(),
                this.prisma.tokenTrade.findMany({
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                })
            ]);

            const totalPages = Math.ceil(total / limit);

            logger.debug('Token trades retrieved', {
                count: trades.length,
                total,
                page,
                totalPages
            });

            return {
                data: trades,
                total,
                page,
                totalPages
            };

        } catch (error) {
            logger.error('Failed to get token trades', error instanceof Error ? error : new Error(String(error)));
            throw new DatabaseError(`Failed to get token trades: ${error}`, 'findMany', 'token_trades', context);
        }
    }

    /**
     * Private validation helper
     */
    private validateTokenTradeData(data: CreateTokenTradeData): void {
        if (!data.fromToken || !data.toToken) {
            throw new ValidationError('Both fromToken and toToken are required', 'tokens');
        }

        if (data.fromAmount <= 0 || data.toAmount <= 0) {
            throw new ValidationError('Trade amounts must be positive', 'amounts');
        }

        if (data.exchangeRate <= 0) {
            throw new ValidationError('Exchange rate must be positive', 'exchangeRate');
        }
    }

    /**
     * Health check implementation
     */
    async performHealthCheck(context?: LogContext): Promise<ServiceHealthCheck> {
        const startTime = Date.now();

        try {
            await this.prisma.tokenTrade.count();
            const latency = Date.now() - startTime;

            return {
                name: 'TokenTradeService',
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
                name: 'TokenTradeService',
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
```

**Why this step:**
- Encapsulates business logic
- Handles data validation
- Provides error handling
- Includes logging and health checks
- Follows the existing service patterns

---

### Step 3: Dependency Injection Factory

**File**: `src/services/di/factories.ts` (add to existing)

Add the import:
```typescript
import { TokenTradeService } from '../database/token-trade-service';
```

Add the factory class:
```typescript
/**
 * TokenTrade service factory
 */
export class TokenTradeServiceFactory extends BaseServiceFactory<TokenTradeService> {
    create(): TokenTradeService {
        log.debug('Creating TokenTradeService instance');
        
        const prisma = getPrismaClient();
        return new TokenTradeService(prisma);
    }
}
```

Update the serviceFactories object:
```typescript
export const serviceFactories = {
    userService: new UserServiceFactory(),
    authService: new AuthServiceFactory(),
    cacheService: new CacheServiceFactory(),
    tokenTradeService: new TokenTradeServiceFactory() // Add this line
} as const;
```

**Why this step:**
- Manages service instantiation
- Handles dependency injection
- Follows the factory pattern
- Enables easy testing and mocking

---

### Step 4: Container Registration

**File**: `src/services/di/container.ts` (update existing)

Add to ServiceContainer interface:
```typescript
export interface ServiceContainer {
    userService: any;
    authService: any;
    cacheService: typeof cacheService;
    databaseService: ReturnType<typeof getPrismaClient>;
    redisService: ReturnType<typeof getRedisClient>;
    tokenTradeService: any; // Add this line
}
```

Add to Container class:
```typescript
class Container implements ServiceContainer {
    // ... existing getters
    
    get tokenTradeService(): any {
        return serviceRegistry.get<any>('tokenTradeService');
    }
}
```

Update initializeContainer function:
```typescript
export function initializeContainer(): void {
    log.info('Initializing service container...');

    // Register core services
    serviceRegistry.registerInstance('databaseService', getPrismaClient());
    serviceRegistry.registerInstance('redisService', getRedisClient());
    serviceRegistry.registerInstance('cacheService', cacheService);

    const { serviceFactories } = require('./factories');
    
    // Register service factories
    serviceRegistry.registerFactory('userService', serviceFactories.userService);
    serviceRegistry.registerFactory('authService', serviceFactories.authService);
    serviceRegistry.registerFactory('enhancedCacheService', serviceFactories.cacheService);
    serviceRegistry.registerFactory('tokenTradeService', serviceFactories.tokenTradeService); // Add this line

    log.info('Service container initialized', {
        services: serviceRegistry.getServiceNames()
    });
}
```

**Why this step:**
- Registers services in the DI container
- Makes services available throughout the app
- Enables loose coupling between components

---

### Step 5: Controller Layer

**File**: `src/api/controllers/token-trade-controller.ts`

```typescript
/**
 * TokenTrade controller with basic CRUD operations
 */

import { Request, Response } from 'express';
import { BaseController } from './base-controller';
import { getService } from '../../services/di/container';
import { 
    TokenTradeService, 
    CreateTokenTradeData, 
    UpdateTokenTradeData
} from '../../services/database/token-trade-service';
import { NotFoundError, ValidationError } from '../../utils/errors';

export class TokenTradeController extends BaseController {
    private tokenTradeService: TokenTradeService;

    constructor() {
        super('TokenTradeController');
        this.tokenTradeService = getService<TokenTradeService>('tokenTradeService');
    }

    /**
     * GET /api/v1/token-trades - List token trades with pagination
     */
    public getTokenTrades = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Getting token trades list');

        // Extract pagination
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        // Get token trades from service
        const result = await this.tokenTradeService.getTokenTrades(
            page,
            limit,
            { requestId: req.headers['x-request-id'] as string }
        );

        const duration = timer.end();
        logger.info('Token trades retrieved successfully', {
            count: result.data.length,
            total: result.total,
            duration: `${duration}ms`
        });

        this.success(res, {
            data: result.data,
            pagination: {
                page: result.page,
                limit,
                total: result.total,
                totalPages: result.totalPages
            }
        });
    });

    /**
     * GET /api/v1/token-trades/:id - Get specific token trade
     */
    public getTokenTrade = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const { id } = req.params;

        logger.info('Getting token trade by ID', { tradeId: id });

        const tokenTrade = await this.tokenTradeService.getTokenTradeById(
            id!, 
            { requestId: req.headers['x-request-id'] as string }
        );

        if (!tokenTrade) {
            throw new NotFoundError('Token trade not found', 'token_trade', id);
        }

        logger.info('Token trade retrieved successfully', { tradeId: id });
        this.success(res, tokenTrade);
    });

    /**
     * POST /api/v1/token-trades - Create new token trade
     */
    public createTokenTrade = this.asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const logger = this.createLogger(req);
        const timer = this.createTimer();

        logger.info('Creating new token trade');

        // Validate required fields
        this.validateRequired(req.body, ['fromToken', 'toToken', 'fromAmount', 'toAmount', 'exchangeRate']);

        const tradeData: CreateTokenTradeData = {
            fromToken: req.body.fromToken,
            toToken: req.body.toToken,
            fromAmount: parseFloat(req.body.fromAmount),
            toAmount: parseFloat(req.body.toAmount),
            exchangeRate: parseFloat(req.body.exchangeRate)
        };

        // Create token trade
        const tokenTrade = await this.tokenTradeService.createTokenTrade(
            tradeData, 
            { requestId: req.headers['x-request-id'] as string }
        );

        const duration = timer.end();
        logger.info('Token trade created successfully', {
            tradeId: tokenTrade.id,
            fromToken: tokenTrade.fromToken,
            toToken: tokenTrade.toToken,
            duration: `${duration}ms`
        });

        this.created(res, tokenTrade);
    });
}
```

**Why this step:**
- Handles HTTP requests and responses
- Validates input data
- Calls service methods
- Provides proper error handling
- Follows REST conventions

---

### Step 6: Route Layer

**File**: `src/api/routes/v1/token-trades.ts`

```typescript
/**
 * Token trade routes - Version 1
 */

import { Router } from 'express';
import { TokenTradeController } from '../../controllers/token-trade-controller';
import { 
    validateBody, 
    validateParams,
    commonSchemas 
} from '../../../middleware/validation';

const router = Router();
const tokenTradeController = new TokenTradeController();

// GET /token-trades - List token trades with pagination
router.get('/', 
    tokenTradeController.getTokenTrades
);

// POST /token-trades - Create a new token trade
router.post('/', 
    validateBody(commonSchemas.createTokenTrade),
    tokenTradeController.createTokenTrade
);

// GET /token-trades/:id - Get token trade by ID
router.get('/:id',
    validateParams(commonSchemas.id),
    tokenTradeController.getTokenTrade
);

export default router;
```

**Why this step:**
- Defines HTTP endpoints
- Applies middleware (auth, validation, rate limiting)
- Maps URLs to controller methods
- Handles route-specific logic

---

### Step 7: Validation Schemas

**File**: `src/middleware/validation/schemas.ts` (add to existing)

```typescript
// Add to existing schemas
export const createTokenTrade = Joi.object({
    fromToken: Joi.string().required().min(1).max(50),
    toToken: Joi.string().required().min(1).max(50),
    fromAmount: Joi.number().positive().required(),
    toAmount: Joi.number().positive().required(),
    exchangeRate: Joi.number().positive().required()
});

// Update commonSchemas export
export const commonSchemas = {
    // ... existing schemas
    createTokenTrade
};
```

**Why this step:**
- Validates incoming request data
- Prevents invalid data from reaching services
- Provides clear error messages
- Follows validation patterns

---

### Step 8: Route Registration

**File**: `src/api/routes/v1/index.ts` (update existing)

```typescript
// Add import
import tokenTradesRouter from './token-trades';

// Register route
router.use('/token-trades', tokenTradesRouter);
```

**Why this step:**
- Makes routes available to the application
- Organizes route structure
- Enables URL routing

---

### Step 9: API Documentation

**File**: `docs/api/paths/token-trades.yaml`

```yaml
# Token trade endpoints

/token-trades:
  get:
    tags:
      - TokenTrades
    summary: List token trades
    description: Retrieve a paginated list of token trades
    operationId: getTokenTrades
    security:
      - bearerAuth: []
      - apiKeyAuth: []
    parameters:
      - name: page
        in: query
        description: Page number
        schema:
          type: integer
          minimum: 1
          default: 1
      - name: limit
        in: query
        description: Items per page
        schema:
          type: integer
          minimum: 1
          maximum: 100
          default: 10
    responses:
      '200':
        description: Token trades retrieved successfully
        content:
          application/json:
            schema:
              allOf:
                - $ref: '../base.yaml#/components/schemas/ApiResponse'
                - type: object
                  properties:
                    data:
                      type: array
                      items:
                        $ref: '../base.yaml#/components/schemas/TokenTrade'
                    pagination:
                      type: object
                      properties:
                        page:
                          type: integer
                        limit:
                          type: integer
                        total:
                          type: integer
                        totalPages:
                          type: integer
      '401':
        $ref: '../base.yaml#/components/responses/UnauthorizedError'

  post:
    tags:
      - TokenTrades
    summary: Create a new token trade
    description: Create a new token trade
    operationId: createTokenTrade
    security:
      - bearerAuth: []
      - apiKeyAuth: []
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '../base.yaml#/components/schemas/CreateTokenTradeRequest'
    responses:
      '201':
        description: Token trade created successfully
        content:
          application/json:
            schema:
              allOf:
                - $ref: '../base.yaml#/components/schemas/ApiResponse'
                - type: object
                  properties:
                    data:
                      $ref: '../base.yaml#/components/schemas/TokenTrade'
      '400':
        $ref: '../base.yaml#/components/responses/ValidationError'
      '401':
        $ref: '../base.yaml#/components/responses/UnauthorizedError'

/token-trades/{id}:
  get:
    tags:
      - TokenTrades
    summary: Get token trade by ID
    description: Retrieve a specific token trade by its ID
    operationId: getTokenTradeById
    security:
      - bearerAuth: []
      - apiKeyAuth: []
    parameters:
      - name: id
        in: path
        required: true
        description: Token trade ID
        schema:
          type: string
    responses:
      '200':
        description: Token trade retrieved successfully
        content:
          application/json:
            schema:
              allOf:
                - $ref: '../base.yaml#/components/schemas/ApiResponse'
                - type: object
                  properties:
                    data:
                      $ref: '../base.yaml#/components/schemas/TokenTrade'
      '401':
        $ref: '../base.yaml#/components/responses/UnauthorizedError'
      '404':
        $ref: '../base.yaml#/components/responses/NotFoundError'
```

**File**: `docs/api/base.yaml` (add to components.schemas)

```yaml
# Add to existing schemas
TokenTrade:
  type: object
  properties:
    id:
      type: string
      example: "trade_clp1234567890abcdef"
    fromToken:
      type: string
      example: "ETH"
    toToken:
      type: string
      example: "USDC"
    fromAmount:
      type: string
      example: "1.5"
    toAmount:
      type: string
      example: "2400.50"
    exchangeRate:
      type: string
      example: "1600.33"
    status:
      type: string
      enum: [PENDING, COMPLETED, FAILED]
      example: "COMPLETED"
    txHash:
      type: string
      example: "0x1234567890abcdef..."
    createdAt:
      type: string
      format: date-time
    updatedAt:
      type: string
      format: date-time

CreateTokenTradeRequest:
  type: object
  required: [fromToken, toToken, fromAmount, toAmount, exchangeRate]
  properties:
    fromToken:
      type: string
      example: "ETH"
    toToken:
      type: string
      example: "USDC"
    fromAmount:
      type: number
      example: 1.5
    toAmount:
      type: number
      example: 2400.50
    exchangeRate:
      type: number
      example: 1600.33

# Add to existing tags
- name: TokenTrades
  description: Token trade management operations
```

**Why this step:**
- Documents the API endpoints
- Provides interactive testing via Swagger UI
- Follows OpenAPI standards
- Enables API client generation

---

### Step 10: Build Documentation

```bash
npm run docs:build
```

**Why this step:**
- Combines modular YAML files into single spec
- Updates the Swagger UI
- Makes documentation available

---

### Step 11: Database Migration & Testing

```bash
# Run database migration
npx prisma migrate dev --name add-token-trades
npx prisma generate

# Start the application
npm run dev

# Test the endpoints
curl -X GET "http://localhost:3000/api/v1/token-trades" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

curl -X POST "http://localhost:3000/api/v1/token-trades" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fromToken": "ETH",
    "toToken": "USDC", 
    "fromAmount": 1.5,
    "toAmount": 2400.50,
    "exchangeRate": 1600.33
  }'
```

---

## 📁 File Structure Summary

```
project/
├── prisma/
│   └── schema.prisma                           # Database model
├── src/
│   ├── services/
│   │   ├── database/
│   │   │   └── token-trade-service.ts          # Business logic
│   │   └── di/
│   │       ├── factories.ts                    # Service factory
│   │       └── container.ts                    # DI container
│   ├── api/
│   │   ├── controllers/
│   │   │   └── token-trade-controller.ts       # HTTP handling
│   │   └── routes/
│   │       └── v1/
│   │           ├── token-trades.ts             # Route definitions
│   │           └── index.ts                    # Route registration
│   └── middleware/
│       └── validation/
│           └── schemas.ts                      # Input validation
└── docs/
    └── api/
        ├── paths/
        │   └── token-trades.yaml               # API documentation
        └── base.yaml                           # Schemas and components
```

## 🔄 Development Workflow Summary

1. **Database First**: Define Prisma schema → migrate → generate
2. **Service Layer**: Create service with business logic and validation
3. **DI Setup**: Add factory and register in container
4. **Controller**: Handle HTTP requests and responses
5. **Routes**: Define endpoints and apply middleware
6. **Validation**: Add input validation schemas
7. **Documentation**: Create OpenAPI documentation
8. **Build & Test**: Build docs and test endpoints

## 🎯 Key Benefits

- **Separation of Concerns**: Each layer has a specific responsibility
- **Dependency Injection**: Loose coupling and easy testing
- **Type Safety**: Full TypeScript support throughout
- **Error Handling**: Consistent error responses
- **Logging**: Structured logging with context
- **Documentation**: Auto-generated interactive API docs
- **Validation**: Input validation at the route level
- **Health Checks**: Built-in service health monitoring

## 🧪 Testing Strategy

- **Unit Tests**: Test services in isolation
- **Integration Tests**: Test controller + service integration
- **API Tests**: Test complete HTTP endpoints
- **Health Checks**: Monitor service health

This architecture provides a solid foundation for building scalable, maintainable APIs with proper separation of concerns and enterprise-grade features.