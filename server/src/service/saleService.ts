import { RedisClient } from '../redis/client';

export type SaleStatus = 'upcoming' | 'active' | 'ended' | 'sold_out';

export interface SaleStatusResult {
  status: SaleStatus;
  stockRemaining: number | null;
  saleStart: string;
  saleEnd: string;
}

export async function getSaleStatus(
  now: Date,
  redisClient: RedisClient,
  saleStart: Date,
  saleEnd: Date
): Promise<SaleStatusResult> {
  const saleStartIso = saleStart.toISOString();
  const saleEndIso = saleEnd.toISOString();

  if (now < saleStart) {
    return { status: 'upcoming', stockRemaining: null, saleStart: saleStartIso, saleEnd: saleEndIso };
  }

  if (now > saleEnd) {
    return { status: 'ended', stockRemaining: null, saleStart: saleStartIso, saleEnd: saleEndIso };
  }

  const stockStr = await redisClient.get('flash:stock');
  const stockRemaining = stockStr !== null ? parseInt(stockStr, 10) : 0;

  if (stockRemaining <= 0) {
    return { status: 'sold_out', stockRemaining: 0, saleStart: saleStartIso, saleEnd: saleEndIso };
  }

  return { status: 'active', stockRemaining, saleStart: saleStartIso, saleEnd: saleEndIso };
}