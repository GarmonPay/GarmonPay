import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { creditReward } from '../controllers/rewardsController';

const router = Router();
// Keep authentication on this retired route; the handler cannot credit balances.
router.post('/credit', requireAuth, creditReward);
export default router;
