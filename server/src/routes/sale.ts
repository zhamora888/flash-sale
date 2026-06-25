import { Router, Request, Response } from 'express';
import { RedisClient } from '../redis/client';
import { getSaleStatus } from '../service/saleService';

export function createSaleRouter(redisClient: RedisClient): Router {
  const router = Router();

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const statusResult = await getSaleStatus(new Date(), redisClient);
      res.json(statusResult);
    } catch (err) {
      console.error('[GET /api/sale/status] Error:', err);
      res.status(500).json({ result: 'internal_error' });
    }
  });

  return router;
}