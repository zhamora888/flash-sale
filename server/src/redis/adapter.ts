import * as fs from 'fs';
import * as path from 'path';
import { RedisClient } from './client';

export type PurchaseResult = 'success' | 'already_purchased' | 'sold_out';

let cachedSha: string | null = null;

export async function loadScript(client: RedisClient): Promise<void> {
  const luaPath = path.join(__dirname, 'scripts', 'purchase.lua');
  const luaSource = fs.readFileSync(luaPath, 'utf-8');
  cachedSha = await client.scriptLoad(luaSource);
}

export async function executePurchase(
  client: RedisClient,
  userId: string,
  timestamp: string
): Promise<PurchaseResult> {
  if (!cachedSha) {
    throw new Error('Lua script not loaded. Call loadScript() first.');
  }

  let raw: unknown;
  try {
    raw = await client.evalSha(cachedSha, { keys: [], arguments: [userId, timestamp] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOSCRIPT')) {
      await loadScript(client);
      raw = await client.evalSha(cachedSha!, { keys: [], arguments: [userId, timestamp] });
    } else {
      throw err;
    }
  }

  const result = raw as number;
  switch (result) {
    case 0:
      return 'success';
    case 1:
      return 'already_purchased';
    case 2:
      return 'sold_out';
    default:
      throw new Error(`Unexpected Lua script result: ${result}`);
  }
}