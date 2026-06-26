import { attemptPurchase } from '../../service/purchaseService';
import { RedisClient } from '../../redis/client';
import * as adapter from '../../redis/adapter';

jest.mock('../../redis/adapter');

const mockExecutePurchase = adapter.executePurchase as jest.MockedFunction<typeof adapter.executePurchase>;

const SALE_START_ISO = '2026-06-25T10:00:00.000Z';
const SALE_END_ISO = '2026-06-25T11:00:00.000Z';
const saleStart = new Date(SALE_START_ISO);
const saleEnd = new Date(SALE_END_ISO);

const mockRedisClient = {} as RedisClient;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('attemptPurchase', () => {
  const activeSaleTime = new Date('2026-06-25T10:30:00.000Z');

  describe('sale_not_active', () => {
    it('returns sale_not_active when before saleStart', async () => {
      const now = new Date('2026-06-25T09:00:00.000Z');
      const result = await attemptPurchase('alice', now, mockRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sale_not_active');
      expect(mockExecutePurchase).not.toHaveBeenCalled();
    });

    it('returns sale_not_active when after saleEnd', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      const result = await attemptPurchase('alice', now, mockRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sale_not_active');
      expect(mockExecutePurchase).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('returns success with purchasedAt when Lua returns success', async () => {
      mockExecutePurchase.mockResolvedValue('success');
      const result = await attemptPurchase('alice', activeSaleTime, mockRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('success');
      expect(result.purchasedAt).toBe(activeSaleTime.toISOString());
      expect(mockExecutePurchase).toHaveBeenCalledWith(mockRedisClient, 'alice', activeSaleTime.toISOString());
    });
  });

  describe('already_purchased', () => {
    it('returns already_purchased when Lua returns already_purchased', async () => {
      mockExecutePurchase.mockResolvedValue('already_purchased');
      const result = await attemptPurchase('alice', activeSaleTime, mockRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('already_purchased');
      expect(result.purchasedAt).toBeUndefined();
    });
  });

  describe('sold_out', () => {
    it('returns sold_out when Lua returns sold_out', async () => {
      mockExecutePurchase.mockResolvedValue('sold_out');
      const result = await attemptPurchase('bob', activeSaleTime, mockRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sold_out');
      expect(result.purchasedAt).toBeUndefined();
    });
  });
});