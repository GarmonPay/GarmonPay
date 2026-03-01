import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getProfile } from '../controllers/userController';

const router = Router();
router.get('/profile', requireAuth, getProfile);
export default router;
