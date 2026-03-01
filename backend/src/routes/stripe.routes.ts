import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import {
  createCheckoutSessionHandler
} from "../controllers/stripe.controller";

const router = Router();

router.post("/checkout-session", asyncHandler(createCheckoutSessionHandler));

export { router as stripeRoutes };
