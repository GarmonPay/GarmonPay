import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { creditRewardHandler } from "../controllers/rewards.controller";

const router = Router();

router.post("/credit", asyncHandler(creditRewardHandler));

export { router as rewardsRoutes };
