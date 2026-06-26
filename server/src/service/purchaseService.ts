import { RedisClient } from '../redis/client';
import { executePurchase, PurchaseResult } from '../redis/adapter';

export interface PurchaseAttemptResult {
  result: PurchaseResult | 'sale_not_active';
  purchasedAt?: string;
}

export interface PurchaseStatusResult {
  purchased: boolean;
  purchasedAt?: string;
}

export async function attemptPurchase(
  userId: string,
  now: Date,
  redisClient: RedisClient,
  saleStart: Date,
  saleEnd: Date
): Promise<PurchaseAttemptResult> {
  if (now < saleStart || now > saleEnd) {
    return { result: 'sale_not_active' };
  }

  const purchaseResult = await executePurchase(redisClient, userId, now.toISOString());

  if (purchaseResult === 'success') {
    return { result: 'success', purchasedAt: now.toISOString() };
  }

  return { result: purchaseResult };
}

export async function getPurchaseStatus(
  userId: string,
  redisClient: RedisClient
): Promise<PurchaseStatusResult> {
  const key = `flash:purchased:${userId}`;
  const purchasedAt = await redisClient.get(key);
  if (purchasedAt !== null) {
    return { purchased: true, purchasedAt };
  }
  return { purchased: false };
}