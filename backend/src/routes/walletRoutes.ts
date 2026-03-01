import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getWallet } from '../controllers/walletController';

const router = Router();
router.get('/', requireAuth, getWallet);
export default router;
