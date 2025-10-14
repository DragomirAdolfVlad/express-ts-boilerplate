/**
 * Custom error classes with proper inheritance
 * 
 * Task 9.1: Custom error classes for comprehensive error handling
 * Requirements: 9
 * 
 * Error Classes:
 * - ValidationError (400): Input validation failures
 * - NotFoundError (404): Resource not found
 * - InternalServerError (500): Internal server errors
 * - DatabaseError (500): Database operation failures
 * - And more...
 */

export interface ErrorContext {
    correlationId?: string;
    userId?: string;
    requestId?: string;
    [key: string]: unknown;
}

/**
 * Base application error class
 */
export abstract class AppError extends Error {
    public override readonly name: string;
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    public readonly context?: ErrorContext;
    public readonly timestamp: Date;

    constructor(
        message: string,
        statusCode: number,
        isOperational: boolean = true,
        context?: ErrorContext
    ) {
        super(message);
        
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        if (context) this.context = context;
        this.timestamp = new Date();

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Convert error to JSON for logging
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            isOperational: this.isOperational,
            context: this.context,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack
        };
    }

    /**
     * Get error details for API response
     */
    getPublicMessage(): string {
        return this.isOperational ? this.message : 'Internal server error';
    }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
    public readonly field: string | undefined;
    public readonly value: unknown;

    constructor(message: string, field?: string, value?: unknown, context?: ErrorContext) {
        super(message, 400, true, context);
        this.field = field;
        this.value = value;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            field: this.field,
            value: this.value
        };
    }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required', context?: ErrorContext) {
        super(message, 401, true, context);
    }
}

/**
 * Unauthorized error (401) - alias for AuthenticationError
 */
export class UnauthorizedError extends AuthenticationError {
    constructor(message: string = 'Unauthorized', context?: ErrorContext) {
        super(message, context);
    }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
    public readonly requiredPermission: string | undefined;
    public readonly userPermissions: string[] | undefined;

    constructor(
        message: string = 'Insufficient permissions',
        requiredPermission?: string,
        userPermissions?: string[],
        context?: ErrorContext
    ) {
        super(message, 403, true, context);
        this.requiredPermission = requiredPermission;
        this.userPermissions = userPermissions;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            requiredPermission: this.requiredPermission,
            userPermissions: this.userPermissions
        };
    }
}

/**
 * Forbidden error (403) - alias for AuthorizationError
 */
export class ForbiddenError extends AuthorizationError {
    constructor(message: string = 'Forbidden', context?: ErrorContext) {
        super(message, undefined, undefined, context);
    }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
    public readonly resource?: string;
    public readonly resourceId?: string;

    constructor(
        message: string = 'Resource not found',
        resource?: string,
        resourceId?: string,
        context?: ErrorContext
    ) {
        super(message, 404, true, context);
        this.resource = resource;
        this.resourceId = resourceId;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            resource: this.resource,
            resourceId: this.resourceId
        };
    }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
    public readonly conflictingResource?: string;
    public readonly conflictingValue?: unknown;

    constructor(
        message: string = 'Resource conflict',
        conflictingResource?: string,
        conflictingValue?: unknown,
        context?: ErrorContext
    ) {
        super(message, 409, true, context);
        this.conflictingResource = conflictingResource;
        this.conflictingValue = conflictingValue;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            conflictingResource: this.conflictingResource,
            conflictingValue: this.conflictingValue
        };
    }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
    public readonly retryAfter?: number;
    public readonly limit?: number;
    public readonly remaining?: number;

    constructor(
        message: string = 'Rate limit exceeded',
        retryAfter?: number,
        limit?: number,
        remaining?: number,
        context?: ErrorContext
    ) {
        super(message, 429, true, context);
        this.retryAfter = retryAfter;
        this.limit = limit;
        this.remaining = remaining;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            retryAfter: this.retryAfter,
            limit: this.limit,
            remaining: this.remaining
        };
    }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends AppError {
    constructor(message: string = 'Internal server error', context?: ErrorContext) {
        super(message, 500, false, context);
    }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
    public readonly operation?: string;
    public readonly table?: string;

    constructor(
        message: string,
        operation?: string,
        table?: string,
        context?: ErrorContext
    ) {
        super(message, 500, false, context);
        this.operation = operation;
        this.table = table;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            operation: this.operation,
            table: this.table
        };
    }
}

/**
 * External service error (502)
 */
export class ExternalServiceError extends AppError {
    public readonly service?: string;
    public readonly endpoint?: string;

    constructor(
        message: string,
        service?: string,
        endpoint?: string,
        context?: ErrorContext
    ) {
        super(message, 502, true, context);
        this.service = service;
        this.endpoint = endpoint;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            service: this.service,
            endpoint: this.endpoint
        };
    }
}

/**
 * Service unavailable error (503)
 */
export class ServiceUnavailableError extends AppError {
    public readonly retryAfter?: number;

    constructor(
        message: string = 'Service temporarily unavailable',
        retryAfter?: number,
        context?: ErrorContext
    ) {
        super(message, 503, true, context);
        this.retryAfter = retryAfter;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            retryAfter: this.retryAfter
        };
    }
}

/**
 * Check if error is an operational error
 */
export function isOperationalError(error: Error): boolean {
    if (error instanceof AppError) {
        return error.isOperational;
    }
    return false;
}

/**
 * Create error from unknown type
 */
export function createErrorFromUnknown(error: unknown, context?: ErrorContext): AppError {
    if (error instanceof AppError) {
        return error;
    }

    if (error instanceof Error) {
        return new InternalServerError(error.message, context);
    }

    if (typeof error === 'string') {
        return new InternalServerError(error, context);
    }

    return new InternalServerError('Unknown error occurred', context);
}

// =============================================================================
// BLOCKCHAIN-SPECIFIC ERROR UTILITIES
// =============================================================================

/**
 * Check if error is retryable for RPC operations
 */
export function isRetryableRPCError(error: Error): boolean {
    const retryableMessages = [
        'archiver',
        'timeout',
        'network',
        'ECONNRESET',
        'ETIMEDOUT',
        'rate limit',
        'invalid block range'
    ];
    return retryableMessages.some(msg => 
        error.message?.toLowerCase().includes(msg.toLowerCase())
    );
}

/**
 * Check if error is retryable for database operations
 */
export function isRetryableDBError(error: Error): boolean {
    const retryableMessages = [
        'deadlock',
        'lock timeout',
        'connection',
        'ECONNREFUSED'
    ];
    return retryableMessages.some(msg => 
        error.message?.toLowerCase().includes(msg.toLowerCase())
    );
}

/**
 * Check if error is retryable for API operations
 */
export function isRetryableAPIError(error: Error): boolean {
    const retryableMessages = [
        'timeout',
        '429', // Rate limit
        '502', // Bad gateway
        '503', // Service unavailable
        '504'  // Gateway timeout
    ];
    return retryableMessages.some(msg => 
        error.message?.toLowerCase().includes(msg.toLowerCase())
    );
}

/**
 * Retry utility with exponential backoff
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: {
        maxAttempts?: number;
        baseDelay?: number;
        maxDelay?: number;
        backoffFactor?: number;
        isRetryable?: (error: Error) => boolean;
        onRetry?: (error: Error, attempt: number) => void;
        context?: string;
    } = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        baseDelay = 1000,
        maxDelay = 30000,
        backoffFactor = 2,
        isRetryable = () => true,
        onRetry,
        context = 'operation'
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry if not retryable or last attempt
            if (!isRetryable(lastError) || attempt === maxAttempts) {
                throw lastError;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                baseDelay * Math.pow(backoffFactor, attempt - 1),
                maxDelay
            );

            // Add jitter (±25%)
            const jitter = delay * (0.75 + Math.random() * 0.5);

            if (onRetry) {
                onRetry(lastError, attempt);
            }

            console.warn(`⚠️  ${context}: Retry ${attempt}/${maxAttempts} after ${Math.round(jitter)}ms - ${lastError.message}`);
            
            await new Promise(resolve => setTimeout(resolve, jitter));
        }
    }

    throw lastError!;
}

/**
 * Circuit breaker for external services
 */
export class CircuitBreaker {
    private failureCount = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';

    constructor(
        private readonly name: string,
        private readonly threshold: number = 5,
        private readonly resetTimeout: number = 30000 // 30 seconds
    ) {}

    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'open') {
            const now = Date.now();
            if (now - this.lastFailureTime >= this.resetTimeout) {
                console.log(`🔄 Circuit breaker [${this.name}]: Attempting recovery (half-open)`);
                this.state = 'half-open';
            } else {
                throw new ServiceUnavailableError(
                    `Circuit breaker [${this.name}] is open`,
                    undefined,
                    { failureCount: this.failureCount.toString() }
                );
            }
        }

        try {
            const result = await operation();
            
            // Success - reset circuit breaker
            if (this.state === 'half-open') {
                console.log(`✅ Circuit breaker [${this.name}]: Recovered (closed)`);
                this.state = 'closed';
                this.failureCount = 0;
            }
            
            return result;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();

            if (this.failureCount >= this.threshold) {
                console.error(`🔴 Circuit breaker [${this.name}]: OPEN (${this.failureCount} failures)`);
                this.state = 'open';
            }

            throw error;
        }
    }

    reset() {
        this.state = 'closed';
        this.failureCount = 0;
        this.lastFailureTime = 0;
        console.log(`🔄 Circuit breaker [${this.name}]: Manually reset`);
    }

    getState() {
        return {
            name: this.name,
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}