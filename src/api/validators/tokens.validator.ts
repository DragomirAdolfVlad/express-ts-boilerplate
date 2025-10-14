/**
 * Token API validation middleware
 * 
 * Provides validation for:
 * - Token address format (Ethereum address: 0x + 40 hex characters)
 * - Pagination parameters (limit: 1-100, offset: >= 0)
 * 
 * Requirements: 9
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../utils/errors';
import { log } from '../../utils/logger';

/**
 * Token address regex pattern
 * Matches Ethereum address format: 0x followed by 40 hexadecimal characters
 */
const TOKEN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Pagination constants
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;
const DEFAULT_OFFSET = 0;
const MIN_OFFSET = 0;

/**
 * Validate token address parameter
 * 
 * Checks that the tokenAddress parameter:
 * - Is present
 * - Matches Ethereum address format (0x + 40 hex characters)
 * 
 * Requirements: 3, 4, 5, 6, 7, 9
 * 
 * @throws ValidationError if token address is missing or invalid
 */
export function validateTokenAddress(req: Request, _res: Response, next: NextFunction): void {
  const logger = log.child({
    middleware: 'validateTokenAddress',
    requestId: req.headers['x-request-id'] as string,
    path: req.path
  });

  try {
    const tokenAddress = req.params['tokenAddress'];

    // Check if token address is present
    if (!tokenAddress) {
      logger.warn('Missing token address parameter');
      throw new ValidationError(
        'Missing token address parameter',
        'tokenAddress'
      );
    }

    // Validate token address format
    if (!TOKEN_ADDRESS_REGEX.test(tokenAddress)) {
      logger.warn('Invalid token address format', { tokenAddress });
      throw new ValidationError(
        'Invalid token address format. Expected: 0x followed by 40 hexadecimal characters',
        'tokenAddress',
        tokenAddress
      );
    }

    logger.debug('Token address validated', { tokenAddress });
    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Validate pagination parameters
 * 
 * Validates and normalizes query parameters:
 * - limit: Must be between 1 and 100 (default: 50)
 * - offset: Must be >= 0 (default: 0)
 * 
 * Requirements: 1, 2, 9
 * 
 * @throws ValidationError if pagination parameters are invalid
 */
export function validatePagination(req: Request, _res: Response, next: NextFunction): void {
  const logger = log.child({
    middleware: 'validatePagination',
    requestId: req.headers['x-request-id'] as string,
    path: req.path
  });

  try {
    const limitParam = req.query['limit'] as string | undefined;
    const offsetParam = req.query['offset'] as string | undefined;

    // Validate limit parameter
    if (limitParam !== undefined) {
      const limit = parseInt(limitParam, 10);

      if (isNaN(limit)) {
        logger.warn('Invalid limit parameter: not a number', { limitParam });
        throw new ValidationError(
          'Invalid limit parameter: must be a number',
          'limit',
          limitParam
        );
      }

      if (limit < MIN_LIMIT) {
        logger.warn('Invalid limit parameter: too small', { limit });
        throw new ValidationError(
          `Invalid limit parameter: must be at least ${MIN_LIMIT}`,
          'limit',
          limit.toString()
        );
      }

      if (limit > MAX_LIMIT) {
        logger.warn('Invalid limit parameter: too large', { limit });
        throw new ValidationError(
          `Invalid limit parameter: must be at most ${MAX_LIMIT}`,
          'limit',
          limit.toString()
        );
      }

      // Store validated limit in query
      req.query['limit'] = limit.toString();
    } else {
      // Set default limit
      req.query['limit'] = DEFAULT_LIMIT.toString();
    }

    // Validate offset parameter
    if (offsetParam !== undefined) {
      const offset = parseInt(offsetParam, 10);

      if (isNaN(offset)) {
        logger.warn('Invalid offset parameter: not a number', { offsetParam });
        throw new ValidationError(
          'Invalid offset parameter: must be a number',
          'offset',
          offsetParam
        );
      }

      if (offset < MIN_OFFSET) {
        logger.warn('Invalid offset parameter: negative', { offset });
        throw new ValidationError(
          'Invalid offset parameter: must be non-negative',
          'offset',
          offset.toString()
        );
      }

      // Store validated offset in query
      req.query['offset'] = offset.toString();
    } else {
      // Set default offset
      req.query['offset'] = DEFAULT_OFFSET.toString();
    }

    logger.debug('Pagination validated', {
      limit: req.query['limit'],
      offset: req.query['offset']
    });

    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Export validation constants for testing
 */
export const VALIDATION_CONSTANTS = {
  TOKEN_ADDRESS_REGEX,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  DEFAULT_OFFSET,
  MIN_OFFSET
};
