import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { getWalletHandler } from "../controllers/wallet.controller";

const router = Router();

router.get("/", asyncHandler(getWalletHandler));

export { router as walletRoutes };
