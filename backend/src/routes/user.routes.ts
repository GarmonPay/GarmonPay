import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { getProfileHandler } from "../controllers/user.controller";

const router = Router();

router.get("/profile", asyncHandler(getProfileHandler));

export { router as userRoutes };
