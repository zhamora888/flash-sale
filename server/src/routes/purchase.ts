import { Router, Request, Response } from 'express';
import { RedisClient } from '../redis/client';
import { attemptPurchase } from '../service/purchaseService';

export function createPurchaseRouter(redisClient: RedisClient): Router {
  const router = Router();

  // POST /api/purchase
  router.post('/', async (req: Request, res: Response) => {
    const { userId } = req.body ?? {};

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      res.status(400).json({ result: 'invalid_request' });
      return;
    }

    try {
      const outcome = await attemptPurchase(userId.trim(), new Date(), redisClient);

      switch (outcome.result) {
        case 'success':
          res.status(200).json({
            result: 'success',
            userId: userId.trim(),
            purchasedAt: outcome.purchasedAt,
          });
          break;
        case 'already_purchased':
          res.status(409).json({ result: 'already_purchased' });
          break;
        case 'sold_out':
          res.status(410).json({ result: 'sold_out' });
          break;
        case 'sale_not_active':
          res.status(400).json({ result: 'sale_not_active' });
          break;
        case 'invalid_request':
          res.status(400).json({ result: 'invalid_request' });
          break;
        default:
          res.status(500).json({ result: 'internal_error' });
      }
    } catch (err) {
      console.error('[POST /api/purchase] Error:', err);
      res.status(500).json({ result: 'internal_error' });
    }
  });

  // GET /api/purchase/status?userId=:userId
  router.get('/status', async (req: Request, res: Response) => {
    const userId = req.query['userId'];

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      res.status(400).json({ result: 'invalid_request' });
      return;
    }

    try {
      const key = `flash:purchased:${userId.trim()}`;
      const purchasedAt = await redisClient.get(key);

      if (purchasedAt !== null) {
        res.json({ purchased: true, purchasedAt });
      } else {
        res.json({ purchased: false });
      }
    } catch (err) {
      console.error('[GET /api/purchase/status] Error:', err);
      res.status(500).json({ result: 'internal_error' });
    }
  });

  return router;
}