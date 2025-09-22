/**
 * Custom error classes with proper inheritance
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