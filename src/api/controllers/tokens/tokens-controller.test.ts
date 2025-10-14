/**
 * TokensController Unit Tests
 * 
 * Tests for the TokensController HTTP request handlers
 */

import { Request, Response } from 'express';
import { TokensController } from './tokens-controller';
import { TokensService } from '../../../services/tokens/tokens.service';
import { HoldersService } from '../../../services/tokens/holders.service';
import { TradersService } from '../../../services/tokens/traders.service';
import { StatsService } from '../../../services/tokens/stats.service';
import { ValidationError, NotFoundError } from '../../../utils/errors';

// Mock services
const mockTokensService = {
  getLatestTokens: jest.fn(),
  getPreBondTokens: jest.fn(),
  tokenExists: jest.fn(),
  getTokenOverview: jest.fn(),
  getTradingData: jest.fn()
} as unknown as TokensService;

const mockHoldersService = {
  getTokenHolders: jest.fn()
} as unknown as HoldersService;

const mockTradersService = {
  getTokenTraders: jest.fn()
} as unknown as TradersService;

const mockStatsService = {
  getServiceStats: jest.fn()
} as unknown as StatsService;

// Mock request and response
const mockRequest = (params = {}, query = {}) => ({
  params,
  query,
  headers: {},
  method: 'GET',
  path: '/test',
  ip: '127.0.0.1'
} as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.getHeader = jest.fn().mockReturnValue('test-request-id');
  return res;
};

describe('TokensController', () => {
  let controller: TokensController;

  beforeEach(() => {
    controller = new TokensController(
      mockTokensService,
      mockHoldersService,
      mockTradersService,
      mockStatsService
    );
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with all service dependencies', () => {
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(TokensController);
    });
  });

  describe('getLatestTokens', () => {
    it('should return paginated tokens with default parameters', async () => {
      const mockTokens = [
        { address: '0x123', name: 'Token1', symbol: 'TK1' }
      ];
      
      (mockTokensService.getLatestTokens as jest.Mock).mockResolvedValue({
        tokens: mockTokens,
        total: 100,
        hasNext: true
      });

      const req = mockRequest({}, {});
      const res = mockResponse();

      await controller.getLatestTokens(req, res);

      expect(mockTokensService.getLatestTokens).toHaveBeenCalledWith(50, 0);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should validate limit parameter', async () => {
      const req = mockRequest({}, { limit: 'invalid' });
      const res = mockResponse();

      await expect(async () => {
        await controller.getLatestTokens(req, res);
      }).rejects.toThrow(ValidationError);
    });

    it('should validate offset parameter', async () => {
      const req = mockRequest({}, { offset: '-1' });
      const res = mockResponse();

      await expect(async () => {
        await controller.getLatestTokens(req, res);
      }).rejects.toThrow(ValidationError);
    });
  });

  describe('getTokenExists', () => {
    it('should return exists: true for existing token', async () => {
      (mockTokensService.tokenExists as jest.Mock).mockResolvedValue(true);

      const req = mockRequest({ tokenAddress: '0x1234567890123456789012345678901234567890' });
      const res = mockResponse();

      await controller.getTokenExists(req, res);

      expect(mockTokensService.tokenExists).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should validate token address format', async () => {
      const req = mockRequest({ tokenAddress: 'invalid' });
      const res = mockResponse();

      await expect(async () => {
        await controller.getTokenExists(req, res);
      }).rejects.toThrow(ValidationError);
    });

    it('should throw error for missing token address', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await expect(async () => {
        await controller.getTokenExists(req, res);
      }).rejects.toThrow(ValidationError);
    });
  });

  describe('getTokenOverview', () => {
    it('should return token overview with transactions', async () => {
      const mockOverview = {
        token: { address: '0x123', name: 'Token1', symbol: 'TK1' },
        stats: { totalVolume: 1000 },
        transactions: []
      };

      (mockTokensService.getTokenOverview as jest.Mock).mockResolvedValue(mockOverview);

      const req = mockRequest({ tokenAddress: '0x1234567890123456789012345678901234567890' });
      const res = mockResponse();

      await controller.getTokenOverview(req, res);

      expect(mockTokensService.getTokenOverview).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 for non-existent token', async () => {
      (mockTokensService.getTokenOverview as jest.Mock).mockRejectedValue(
        new Error('Token not found')
      );

      const req = mockRequest({ tokenAddress: '0x1234567890123456789012345678901234567890' });
      const res = mockResponse();

      await expect(async () => {
        await controller.getTokenOverview(req, res);
      }).rejects.toThrow(NotFoundError);
    });
  });

  describe('getTokenHolders', () => {
    it('should return holder rankings', async () => {
      const mockHolders = [
        { address: '0x123', rank: 1, netTokens: 1000 }
      ];

      (mockHoldersService.getTokenHolders as jest.Mock).mockResolvedValue(mockHolders);

      const req = mockRequest({ tokenAddress: '0x1234567890123456789012345678901234567890' });
      const res = mockResponse();

      await controller.getTokenHolders(req, res);

      expect(mockHoldersService.getTokenHolders).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getTokenTraders', () => {
    it('should return trader rankings', async () => {
      const mockTraders = [
        { address: '0x123', rank: 1, totalPnlUsd: 1000 }
      ];

      (mockTradersService.getTokenTraders as jest.Mock).mockResolvedValue(mockTraders);

      const req = mockRequest({ tokenAddress: '0x1234567890123456789012345678901234567890' });
      const res = mockResponse();

      await controller.getTokenTraders(req, res);

      expect(mockTradersService.getTokenTraders).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getTokensStats', () => {
    it('should return service statistics', async () => {
      const mockStats = {
        totalTokens: 100,
        totalTrades: 1000,
        totalVolumeUsd: 50000
      };

      (mockStatsService.getServiceStats as jest.Mock).mockResolvedValue(mockStats);

      const req = mockRequest();
      const res = mockResponse();

      await controller.getTokensStats(req, res);

      expect(mockStatsService.getServiceStats).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
