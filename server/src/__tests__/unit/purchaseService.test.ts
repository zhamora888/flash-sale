import { attemptPurchase } from '../../service/purchaseService';
import { RedisClient } from '../../redis/client';
import * as adapter from '../../redis/adapter';

jest.mock('../../redis/adapter');

const mockExecutePurchase = adapter.executePurchase as jest.MockedFunction<typeof adapter.executePurchase>;

const SALE_START = '2026-06-25T10:00:00.000Z';
const SALE_END = '2026-06-25T11:00:00.000Z';

const mockRedisClient = {} as RedisClient;

beforeEach(() => {
  jest.resetAllMocks();
  process.env['SALE_START'] = SALE_START;
  process.env['SALE_END'] = SALE_END;
});

describe('attemptPurchase', () => {
  const activeSaleTime = new Date('2026-06-25T10:30:00.000Z');

  describe('invalid_request', () => {
    it('returns invalid_request for empty userId', async () => {
      const result = await attemptPurchase('', activeSaleTime, mockRedisClient);
      expect(result.result).toBe('invalid_request');
      expect(mockExecutePurchase).not.toHaveBeenCalled();
    });

    it('returns invalid_request for whitespace userId', async () => {
      const result = await attemptPurchase('   ', activeSaleTime, mockRedisClient);
      expect(result.result).toBe('invalid_request');
    });
  });

  describe('sale_not_active', () => {
    it('returns sale_not_active when before SALE_START', async () => {
      const now = new Date('2026-06-25T09:00:00.000Z');
      const result = await attemptPurchase('alice', now, mockRedisClient);
      expect(result.result).toBe('sale_not_active');
      expect(mockExecutePurchase).not.toHaveBeenCalled();
    });

    it('returns sale_not_active when after SALE_END', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      const result = await attemptPurchase('alice', now, mockRedisClient);
      expect(result.result).toBe('sale_not_active');
      expect(mockExecutePurchase).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('returns success with purchasedAt when Lua returns success', async () => {
      mockExecutePurchase.mockResolvedValue('success');
      const result = await attemptPurchase('alice', activeSaleTime, mockRedisClient);
      expect(result.result).toBe('success');
      expect(result.purchasedAt).toBe(activeSaleTime.toISOString());
      expect(mockExecutePurchase).toHaveBeenCalledWith(mockRedisClient, 'alice', activeSaleTime.toISOString());
    });
  });

  describe('already_purchased', () => {
    it('returns already_purchased when Lua returns already_purchased', async () => {
      mockExecutePurchase.mockResolvedValue('already_purchased');
      const result = await attemptPurchase('alice', activeSaleTime, mockRedisClient);
      expect(result.result).toBe('already_purchased');
      expect(result.purchasedAt).toBeUndefined();
    });
  });

  describe('sold_out', () => {
    it('returns sold_out when Lua returns sold_out', async () => {
      mockExecutePurchase.mockResolvedValue('sold_out');
      const result = await attemptPurchase('bob', activeSaleTime, mockRedisClient);
      expect(result.result).toBe('sold_out');
      expect(result.purchasedAt).toBeUndefined();
    });
  });
});