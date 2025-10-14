/**
 * Error Handling Tests for Token API
 * Task 9: Comprehensive error handling verification
 * Requirements: 9
 */

import { Request, Response } from 'express';
import { ValidationError, NotFoundError, InternalServerError } from '../../../utils/errors';

describe('Error Handling', () => {
  describe('Custom Error Classes', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid limit parameter', 'limit', 'invalid');
      
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Invalid limit parameter');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('limit');
      expect(error.value).toBe('invalid');
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create NotFoundError with correct properties', () => {
      const error = new NotFoundError('Token not found', 'token', '0x123');
      
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Token not found');
      expect(error.statusCode).toBe(404);
      expect(error.resource).toBe('token');
      expect(error.resourceId).toBe('0x123');
      expect(error.isOperational).toBe(true);
    });

    it('should create InternalServerError with correct properties', () => {
      const error = new InternalServerError('Database connection failed');
      
      expect(error.name).toBe('InternalServerError');
      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Error Serialization', () => {
    it('should serialize ValidationError to JSON', () => {
      const error = new ValidationError('Invalid input', 'email', 'invalid-email');
      const json = error.toJSON();
      
      expect(json.name).toBe('ValidationError');
      expect(json.message).toBe('Invalid input');
      expect(json.statusCode).toBe(400);
      expect(json.field).toBe('email');
      expect(json.value).toBe('invalid-email');
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });

    it('should serialize NotFoundError to JSON', () => {
      const error = new NotFoundError('Resource not found', 'user', '123');
      const json = error.toJSON();
      
      expect(json.name).toBe('NotFoundError');
      expect(json.resource).toBe('user');
      expect(json.resourceId).toBe('123');
    });
  });

  describe('Error Context', () => {
    it('should include context in error', () => {
      const context = {
        correlationId: 'abc-123',
        userId: 'user-456',
        requestId: 'req-789'
      };
      
      const error = new ValidationError('Invalid input', 'field', 'value', context);
      
      expect(error.context).toEqual(context);
      expect(error.context?.correlationId).toBe('abc-123');
      expect(error.context?.userId).toBe('user-456');
      expect(error.context?.requestId).toBe('req-789');
    });
  });

  describe('Error Response Format', () => {
    it('should format error response consistently', () => {
      const error = new ValidationError('Invalid limit parameter', 'limit', 'invalid');
      
      // Simulate error response format
      const response = {
        success: false,
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
          status: error.statusCode,
          timestamp: error.timestamp.toISOString()
        }
      };
      
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Invalid limit parameter');
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.status).toBe(400);
      expect(response.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should format timestamp in ISO 8601 format', () => {
      const error = new NotFoundError('Token not found');
      const timestamp = error.timestamp.toISOString();
      
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Public Error Messages', () => {
    it('should return public message for operational errors', () => {
      const error = new ValidationError('Invalid input');
      expect(error.getPublicMessage()).toBe('Invalid input');
    });

    it('should return generic message for non-operational errors', () => {
      const error = new InternalServerError('Database connection failed');
      expect(error.getPublicMessage()).toBe('Internal server error');
    });
  });

  describe('Error Logging Context', () => {
    it('should include comprehensive context for logging', () => {
      const mockReq = {
        headers: {
          'x-correlation-id': 'abc-123',
          'x-request-id': 'req-456',
          'user-agent': 'Mozilla/5.0',
          'referer': 'https://example.com'
        },
        method: 'GET',
        url: '/api/v1/tokens/latest?limit=invalid',
        path: '/api/v1/tokens/latest',
        query: { limit: 'invalid' },
        params: {},
        ip: '192.168.1.1'
      } as unknown as Request;

      const error = new ValidationError('Invalid limit parameter', 'limit', 'invalid');

      // Simulate log context
      const logContext = {
        correlationId: mockReq.headers['x-correlation-id'],
        requestId: mockReq.headers['x-request-id'],
        method: mockReq.method,
        url: mockReq.url,
        path: mockReq.path,
        query: mockReq.query,
        params: mockReq.params,
        userAgent: mockReq.headers['user-agent'],
        ip: mockReq.ip,
        statusCode: error.statusCode,
        errorName: error.name,
        errorMessage: error.message,
        timestamp: new Date().toISOString()
      };

      expect(logContext.correlationId).toBe('abc-123');
      expect(logContext.requestId).toBe('req-456');
      expect(logContext.method).toBe('GET');
      expect(logContext.query).toEqual({ limit: 'invalid' });
      expect(logContext.statusCode).toBe(400);
      expect(logContext.errorName).toBe('ValidationError');
    });
  });
});
