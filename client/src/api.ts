export type SaleStatusValue = 'upcoming' | 'active' | 'ended' | 'sold_out';

export interface SaleStatus {
  status: SaleStatusValue;
  stockRemaining: number;
  saleStart: string;
  saleEnd: string;
}

export type PurchaseResultValue =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'sale_not_active'
  | 'invalid_request';

export interface PurchaseResult {
  result: PurchaseResultValue;
  userId?: string;
  purchasedAt?: string;
}

export interface PurchaseStatus {
  purchased: boolean;
  purchasedAt?: string;
}

export async function getSaleStatus(): Promise<SaleStatus> {
  const res = await fetch('/api/sale/status');
  if (!res.ok) throw new Error(`Sale status fetch failed: ${res.status}`);
  return res.json() as Promise<SaleStatus>;
}

export async function attemptPurchase(userId: string): Promise<PurchaseResult> {
  const res = await fetch('/api/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return res.json() as Promise<PurchaseResult>;
}

export async function getPurchaseStatus(userId: string): Promise<PurchaseStatus> {
  const res = await fetch(`/api/purchase/status?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`Purchase status fetch failed: ${res.status}`);
  return res.json() as Promise<PurchaseStatus>;
}