import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import {
  adminListRewardsHandler,
  adminListUsersHandler,
  adminListWithdrawalsHandler,
  adminManualCreditHandler,
  adminProcessWithdrawalHandler
} from "../controllers/admin.controller";
import { listAnalyticsEventsHandler } from "../controllers/analytics.controller";

const router = Router();

router.get("/users", asyncHandler(adminListUsersHandler));
router.get("/withdrawals", asyncHandler(adminListWithdrawalsHandler));
router.patch("/withdrawals/:id", asyncHandler(adminProcessWithdrawalHandler));
router.post("/wallets/credit", asyncHandler(adminManualCreditHandler));
router.get("/rewards", asyncHandler(adminListRewardsHandler));
router.get("/analytics", asyncHandler(listAnalyticsEventsHandler));

export { router as adminRoutes };
