import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisClient } from '../redis/client';
import { attemptPurchase, getPurchaseStatus } from '../service/purchaseService';

const MAX_USER_ID_LENGTH = 256;

const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { result: 'rate_limited' },
});

export function createPurchaseRouter(redisClient: RedisClient, saleStart: Date, saleEnd: Date): Router {
  const router = Router();

  // POST /api/purchase
  router.post('/', purchaseLimiter, async (req: Request, res: Response) => {
    const { userId } = req.body ?? {};

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      res.status(400).json({ result: 'invalid_request' });
      return;
    }

    if (userId.length > MAX_USER_ID_LENGTH) {
      res.status(400).json({ result: 'invalid_request' });
      return;
    }

    try {
      const outcome = await attemptPurchase(userId.trim(), new Date(), redisClient, saleStart, saleEnd);

      switch (outcome.result) {
        case 'success':
          res.status(200).json({ result: 'success', userId: userId.trim(), purchasedAt: outcome.purchasedAt });
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
        default:
          res.status(500).json({ result: 'internal_error' });
      }
    } catch (err) {
      console.error('[POST /api/purchase] Error:', err);
      res.status(500).json({ result: 'internal_error' });
    }
  });

  // GET /api/purchase/status/:userId
  router.get('/status/:userId', async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!userId || userId.trim() === '' || userId.length > MAX_USER_ID_LENGTH) {
      res.status(400).json({ result: 'invalid_request' });
      return;
    }

    try {
      const status = await getPurchaseStatus(userId.trim(), redisClient);
      res.json(status);
    } catch (err) {
      console.error('[GET /api/purchase/status/:userId] Error:', err);
      res.status(500).json({ result: 'internal_error' });
    }
  });

  return router;
}