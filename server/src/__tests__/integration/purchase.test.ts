/**
 * Integration tests for the purchase flow.
 * Requires a live Redis instance. Set REDIS_URL env var or defaults to redis://localhost:6379.
 * Creates its own Redis client for setup/teardown, independent of the app's client.
 */

import { createRedisClient, RedisClient } from '../../redis/client';
import { loadScript } from '../../redis/adapter';
import { attemptPurchase } from '../../service/purchaseService';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

// Sale window: started 1 minute ago, ends 1 hour from now
const saleStart = new Date(Date.now() - 60_000);
const saleEnd = new Date(Date.now() + 3_600_000);

let testRedisClient: RedisClient;
let appRedisClient: RedisClient;

beforeAll(async () => {
  process.env['REDIS_URL'] = REDIS_URL;

  testRedisClient = await createRedisClient(REDIS_URL);
  appRedisClient = await createRedisClient(REDIS_URL);
  await loadScript(appRedisClient);
});

afterAll(async () => {
  await testRedisClient.quit();
  await appRedisClient.quit();
});

async function flushFlashKeys(): Promise<void> {
  let cursor = 0;
  do {
    const reply = await testRedisClient.scan(cursor, { MATCH: 'flash:*', COUNT: 100 });
    cursor = reply.cursor;
    if (reply.keys.length > 0) {
      await testRedisClient.del(reply.keys);
    }
  } while (cursor !== 0);
}

afterEach(async () => {
  await flushFlashKeys();
});

async function initStock(quantity: number): Promise<void> {
  await testRedisClient.set('flash:stock', quantity);
}

describe('Integration: purchase flow', () => {
  const now = () => new Date();

  describe('happy path', () => {
    it('returns success for a new user with stock available', async () => {
      await initStock(10);
      const result = await attemptPurchase('alice', now(), appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('success');
      expect(result.purchasedAt).toBeDefined();
      const stock = await testRedisClient.get('flash:stock');
      expect(parseInt(stock as string, 10)).toBe(9);
    });

    it('purchasedAt is a valid ISO 8601 string', async () => {
      await initStock(10);
      const result = await attemptPurchase('bob', now(), appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('success');
      expect(new Date(result.purchasedAt as string).toISOString()).toBe(result.purchasedAt);
    });
  });

  describe('duplicate purchase', () => {
    it('returns already_purchased on second attempt from same user', async () => {
      await initStock(10);
      const first = await attemptPurchase('alice', now(), appRedisClient, saleStart, saleEnd);
      expect(first.result).toBe('success');

      const second = await attemptPurchase('alice', now(), appRedisClient, saleStart, saleEnd);
      expect(second.result).toBe('already_purchased');

      const stock = await testRedisClient.get('flash:stock');
      expect(parseInt(stock as string, 10)).toBe(9);
    });
  });

  describe('stock exhausted', () => {
    it('returns sold_out when stock is 0', async () => {
      await initStock(0);
      const result = await attemptPurchase('charlie', now(), appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sold_out');
    });

    it('last item: only one buyer succeeds when stock=1', async () => {
      await initStock(1);
      const results = await Promise.all([
        attemptPurchase('user-a', now(), appRedisClient, saleStart, saleEnd),
        attemptPurchase('user-b', now(), appRedisClient, saleStart, saleEnd),
        attemptPurchase('user-c', now(), appRedisClient, saleStart, saleEnd),
      ]);
      const successes = results.filter((r) => r.result === 'success');
      const soldOuts = results.filter((r) => r.result === 'sold_out');
      expect(successes).toHaveLength(1);
      expect(soldOuts).toHaveLength(2);
    });
  });

  describe('sale window enforcement', () => {
    it('returns sale_not_active before saleStart', async () => {
      await initStock(10);
      const pastTime = new Date(saleStart.getTime() - 10_000);
      const result = await attemptPurchase('diana', pastTime, appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sale_not_active');
    });

    it('returns sale_not_active after saleEnd', async () => {
      await initStock(10);
      const futureTime = new Date(saleEnd.getTime() + 10_000);
      const result = await attemptPurchase('eve', futureTime, appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sale_not_active');
    });
  });

  describe('input validation', () => {
    it('returns invalid_request for empty userId', async () => {
      await initStock(10);
      const result = await attemptPurchase('', now(), appRedisClient, saleStart, saleEnd);
      expect(result.result).toBe('sale_not_active');
    });
  });

  describe('concurrent duplicate storm', () => {
    it('exactly 1 success for 20 concurrent requests from same userId', async () => {
      await initStock(100);
      const concurrentRequests = Array.from({ length: 20 }, () =>
        attemptPurchase('concurrent-user', now(), appRedisClient, saleStart, saleEnd)
      );
      const results = await Promise.all(concurrentRequests);
      const successes = results.filter((r) => r.result === 'success');
      const duplicates = results.filter((r) => r.result === 'already_purchased');
      expect(successes).toHaveLength(1);
      expect(duplicates).toHaveLength(19);
    });
  });

  describe('concurrent race with stock=1', () => {
    it('exactly 1 success for N concurrent unique users when stock=1', async () => {
      await initStock(1);
      const N = 10;
      const concurrentRequests = Array.from({ length: N }, (_, i) =>
        attemptPurchase(`racer-${i}`, now(), appRedisClient, saleStart, saleEnd)
      );
      const results = await Promise.all(concurrentRequests);
      const successes = results.filter((r) => r.result === 'success');
      const soldOuts = results.filter((r) => r.result === 'sold_out');
      expect(successes).toHaveLength(1);
      expect(soldOuts).toHaveLength(N - 1);
    });
  });
});