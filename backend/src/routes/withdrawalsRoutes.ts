import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requestWithdrawal } from '../controllers/withdrawalsController';

const router = Router();
router.post('/request', requireAuth, requestWithdrawal);
export default router;
