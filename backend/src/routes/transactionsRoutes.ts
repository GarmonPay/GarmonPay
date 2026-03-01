import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getTransactions } from '../controllers/transactionsController';

const router = Router();
router.get('/', requireAuth, getTransactions);
export default router;
