import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import {
  listUserWithdrawalsHandler,
  requestWithdrawalHandler
} from "../controllers/withdrawals.controller";

const router = Router();

router.get("/", asyncHandler(listUserWithdrawalsHandler));
router.post("/request", asyncHandler(requestWithdrawalHandler));

export { router as withdrawalsRoutes };
