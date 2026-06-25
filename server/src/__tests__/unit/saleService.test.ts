import { getSaleStatus } from '../../service/saleService';
import { RedisClient } from '../../redis/client';

// Fixed reference times
const SALE_START = '2026-06-25T10:00:00.000Z';
const SALE_END = '2026-06-25T11:00:00.000Z';

const mockRedisClient = {
  get: jest.fn(),
} as unknown as RedisClient;

beforeEach(() => {
  jest.resetAllMocks();
  process.env['SALE_START'] = SALE_START;
  process.env['SALE_END'] = SALE_END;
});

describe('getSaleStatus', () => {
  describe('upcoming (before SALE_START)', () => {
    it('returns upcoming when now is well before start', async () => {
      const now = new Date('2026-06-25T09:00:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('upcoming');
      expect(result.saleStart).toBe(SALE_START);
      expect(result.saleEnd).toBe(SALE_END);
    });

    it('returns upcoming 1ms before start', async () => {
      const now = new Date(new Date(SALE_START).getTime() - 1);
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('upcoming');
    });

    it('does not call redis when upcoming', async () => {
      const now = new Date('2026-06-25T09:59:59.000Z');
      await getSaleStatus(now, mockRedisClient);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('ended (after SALE_END)', () => {
    it('returns ended when now is well after end', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('ended');
    });

    it('returns ended 1ms after end', async () => {
      const now = new Date(new Date(SALE_END).getTime() + 1);
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('ended');
    });

    it('does not call redis when ended', async () => {
      const now = new Date('2026-06-25T12:00:00.000Z');
      await getSaleStatus(now, mockRedisClient);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });
  });

  describe('sold_out (within window, stock <= 0)', () => {
    it('returns sold_out when stock is 0', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('0');
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('sold_out');
      expect(result.stockRemaining).toBe(0);
    });

    it('returns sold_out when stock key is null', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue(null);
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('sold_out');
    });
  });

  describe('active (within window, stock > 0)', () => {
    it('returns active with correct stockRemaining', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('42');
      const now = new Date('2026-06-25T10:30:00.000Z');
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('active');
      expect(result.stockRemaining).toBe(42);
      expect(result.saleStart).toBe(SALE_START);
      expect(result.saleEnd).toBe(SALE_END);
    });

    it('returns active at exactly SALE_START', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('10');
      const now = new Date(SALE_START);
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('active');
    });

    it('returns active at exactly SALE_END', async () => {
      (mockRedisClient.get as jest.Mock).mockResolvedValue('1');
      const now = new Date(SALE_END);
      const result = await getSaleStatus(now, mockRedisClient);
      expect(result.status).toBe('active');
    });
  });
});