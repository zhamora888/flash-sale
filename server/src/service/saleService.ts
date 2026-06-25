import { RedisClient } from '../redis/client';

export type SaleStatus = 'upcoming' | 'active' | 'ended' | 'sold_out';

export interface SaleStatusResult {
  status: SaleStatus;
  stockRemaining: number;
  saleStart: string;
  saleEnd: string;
}

export async function getSaleStatus(
  now: Date,
  redisClient: RedisClient
): Promise<SaleStatusResult> {
  const saleStart = new Date(process.env.SALE_START as string);
  const saleEnd = new Date(process.env.SALE_END as string);

  const saleStartIso = saleStart.toISOString();
  const saleEndIso = saleEnd.toISOString();

  // Check window first
  if (now < saleStart) {
    return {
      status: 'upcoming',
      stockRemaining: 0,
      saleStart: saleStartIso,
      saleEnd: saleEndIso,
    };
  }

  if (now > saleEnd) {
    return {
      status: 'ended',
      stockRemaining: 0,
      saleStart: saleStartIso,
      saleEnd: saleEndIso,
    };
  }

  // Within window — check stock
  const stockStr = await redisClient.get('flash:stock');
  const stockRemaining = stockStr !== null ? parseInt(stockStr, 10) : 0;

  if (stockRemaining <= 0) {
    return {
      status: 'sold_out',
      stockRemaining: 0,
      saleStart: saleStartIso,
      saleEnd: saleEndIso,
    };
  }

  return {
    status: 'active',
    stockRemaining,
    saleStart: saleStartIso,
    saleEnd: saleEndIso,
  };
}