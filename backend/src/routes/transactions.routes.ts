import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { getTransactionsHandler } from "../controllers/transactions.controller";

const router = Router();

router.get("/", asyncHandler(getTransactionsHandler));

export { router as transactionsRoutes };
