import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { creditReward } from '../controllers/rewardsController';

const router = Router();
router.post('/credit', requireAuth, creditReward);
export default router;
