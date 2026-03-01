import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { trackEvent } from '../controllers/analyticsController';

const router = Router();
router.post('/event', requireAuth, trackEvent);
export default router;
