import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { trackAnalyticsEventHandler } from "../controllers/analytics.controller";
import { optionalAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/event", optionalAuth, asyncHandler(trackAnalyticsEventHandler));

export { router as analyticsRoutes };
