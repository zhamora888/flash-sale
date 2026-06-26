import { getSaleStatus } from '../../service/saleService';
import { RedisClient } from '../../redis/client';

const SALE_START_ISO = '2026-06-25T10:00:00.000Z';
const SALE_END_ISO = '2026-06-25T11:00:00.000Z';
const saleStart = new Date(SALE_START_ISO);
const saleEnd = new Date(SALE_END_ISO);

const mockRedisClient = {
  get: jest.fn(),
} as unknown as RedisClient;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getSaleStatus', () => {
  describe('upcoming (before saleStart)', () => {
    it('returns upcoming when now is well before start', async () => {
      const now = new Date('2026-06-25T09:00:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('upcoming');
      expect(result.saleStart).toBe(SALE_START_ISO);
      expect(result.saleEnd).toBe(SALE_END_ISO);
      expect(result.stockRemaining).toBeNull();
    });

    it('returns upcoming 1ms before start', async () => {
      const now = new Date(saleStart.getTime() - 1);
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('upcoming');
      expect(result.stockRemaining).toBeNull();
    });

    it('does not call redis when upcoming', async () => {
      const now = new Date('2026-06-25T09:59:59.000Z');
      await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('ended (after saleEnd)', () => {
    it('returns ended when now is well after end', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('ended');
      expect(result.stockRemaining).toBeNull();
    });

    it('returns ended 1ms after end', async () => {
      const now = new Date(saleEnd.getTime() + 1);
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('ended');
    });

    it('does not call redis when ended', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('sold_out (within window, stock <= 0)', () => {
    it('returns sold_out when stock is 0', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('0');
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('sold_out');
      expect(result.stockRemaining).toBe(0);
    });

    it('returns sold_out when stock key is null', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('sold_out');
    });
  });

  describe('active (within window, stock > 0)', () => {
    it('returns active with correct stockRemaining', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('42');
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('active');
      expect(result.stockRemaining).toBe(42);
      expect(result.saleStart).toBe(SALE_START_ISO);
      expect(result.saleEnd).toBe(SALE_END_ISO);
    });

    it('returns active at exactly saleStart', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('10');
      const result = await getSaleStatus(saleStart, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('active');
    });

    it('returns active at exactly saleEnd', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('1');
      const result = await getSaleStatus(saleEnd, mockRedisClient, saleStart, saleEnd);
      expect(result.status).toBe('active');
    });
  });
});