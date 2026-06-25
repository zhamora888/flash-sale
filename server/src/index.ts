import * as path from 'path';
import express from 'express';
import cors from 'cors';
import { createRedisClient } from './redis/client';
import { loadScript } from './redis/adapter';
import { createSaleRouter } from './routes/sale';
import { createPurchaseRouter } from './routes/purchase';

// ─── Env Validation (AD-5) ───────────────────────────────────────────────────

function validateEnv(): {
  stockQuantity: number;
  saleStart: Date;
  saleEnd: Date;
  redisUrl: string;
  port: number;
  nodeEnv: string;
} {
  const errors: string[] = [];

  const rawStock = process.env['STOCK_QUANTITY'];
  const rawStart = process.env['SALE_START'];
  const rawEnd = process.env['SALE_END'];
  const rawRedis = process.env['REDIS_URL'];

  if (!rawStock) {
    errors.push('STOCK_QUANTITY is required (e.g. STOCK_QUANTITY=100)');
  }
  if (!rawStart) {
    errors.push('SALE_START is required (ISO 8601 string, e.g. SALE_START=2026-06-25T10:00:00.000Z)');
  }
  if (!rawEnd) {
    errors.push('SALE_END is required (ISO 8601 string, e.g. SALE_END=2026-06-25T11:00:00.000Z)');
  }
  if (!rawRedis) {
    errors.push('REDIS_URL is required (e.g. REDIS_URL=redis://localhost:6379)');
  }

  if (errors.length > 0) {
    console.error('[Startup] Missing required environment variables:');
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const stockQuantity = parseInt(rawStock as string, 10);
  if (isNaN(stockQuantity) || stockQuantity < 0) {
    console.error('[Startup] STOCK_QUANTITY must be a non-negative integer');
    process.exit(1);
  }

  const saleStart = new Date(rawStart as string);
  if (isNaN(saleStart.getTime())) {
    console.error('[Startup] SALE_START must be a valid ISO 8601 date string');
    process.exit(1);
  }

  const saleEnd = new Date(rawEnd as string);
  if (isNaN(saleEnd.getTime())) {
    console.error('[Startup] SALE_END must be a valid ISO 8601 date string');
    process.exit(1);
  }

  if (saleEnd <= saleStart) {
    console.error('[Startup] SALE_END must be after SALE_START');
    process.exit(1);
  }

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';

  return {
    stockQuantity,
    saleStart,
    saleEnd,
    redisUrl: rawRedis as string,
    port,
    nodeEnv,
  };
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  const { stockQuantity, redisUrl, port, nodeEnv } = validateEnv();

  // Connect to Redis
  console.log(`[Startup] Connecting to Redis at ${redisUrl} …`);
  const redisClient = await createRedisClient(redisUrl);
  console.log('[Startup] Redis connected.');

  // Load Lua script (AD-1)
  await loadScript(redisClient);
  console.log('[Startup] Lua purchase script loaded.');

  // Initialize stock with SET NX — never overwrites existing value (AD-2)
  const wasSet = await redisClient.set('flash:stock', stockQuantity, { NX: true });
  if (wasSet === null) {
    const current = await redisClient.get('flash:stock');
    console.log(`[Startup] flash:stock already set to ${current} — SET NX no-op (preserving existing value).`);
  } else {
    console.log(`[Startup] flash:stock initialized to ${stockQuantity}.`);
  }

  // ─── Express App ──────────────────────────────────────────────────────────

  const app = express();
  app.use(express.json());

  // CORS: development only (AD-3 boundary)
  if (nodeEnv === 'development') {
    app.use(cors());
    console.log('[Startup] CORS enabled (development mode).');
  }

  // Routes (AD-3: routes → service → redis adapter)
  app.use('/api/sale', createSaleRouter(redisClient));
  app.use('/api/purchase', createPurchaseRouter(redisClient));

  // Serve static client build in production
  if (nodeEnv === 'production') {
    const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`[Startup] Server listening on http://localhost:${port}`);
  });
}

bootstrap().catch((err: Error) => {
  console.error('[Startup] Fatal error:', err.message);
  process.exit(1);
});