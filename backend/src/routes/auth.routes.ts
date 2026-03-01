import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { loginHandler, registerHandler } from "../controllers/auth.controller";

const router = Router();

router.post("/register", asyncHandler(registerHandler));
router.post("/login", asyncHandler(loginHandler));

export { router as authRoutes };
