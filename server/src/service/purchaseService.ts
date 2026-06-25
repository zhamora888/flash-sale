import { RedisClient } from '../redis/client';
import { executePurchase, PurchaseResult } from '../redis/adapter';

export interface PurchaseAttemptResult {
  result: PurchaseResult | 'sale_not_active' | 'invalid_request';
  purchasedAt?: string;
}

export async function attemptPurchase(
  userId: string,
  now: Date,
  redisClient: RedisClient
): Promise<PurchaseAttemptResult> {
  // Validate userId
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return { result: 'invalid_request' };
  }

  const saleStart = new Date(process.env.SALE_START as string);
  const saleEnd = new Date(process.env.SALE_END as string);

  // Check sale window
  if (now < saleStart || now > saleEnd) {
    return { result: 'sale_not_active' };
  }

  // Execute atomic purchase via Lua script
  const purchaseResult = await executePurchase(redisClient, userId, now.toISOString());

  if (purchaseResult === 'success') {
    return {
      result: 'success',
      purchasedAt: now.toISOString(),
    };
  }

  return { result: purchaseResult };
}