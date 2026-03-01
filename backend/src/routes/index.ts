import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./user.routes";
import { walletRoutes } from "./wallet.routes";
import { rewardsRoutes } from "./rewards.routes";
import { withdrawalsRoutes } from "./withdrawals.routes";
import { transactionsRoutes } from "./transactions.routes";
import { analyticsRoutes } from "./analytics.routes";
import { adminRoutes } from "./admin.routes";
import { stripeRoutes } from "./stripe.routes";
import { requireAuth } from "../middleware/auth.middleware";
import { requireAdmin } from "../middleware/admin.middleware";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/analytics", analyticsRoutes);
apiRouter.use("/stripe", stripeRoutes);

apiRouter.use("/user", requireAuth, userRoutes);
apiRouter.use("/wallet", requireAuth, walletRoutes);
apiRouter.use("/rewards", requireAuth, rewardsRoutes);
apiRouter.use("/withdrawals", requireAuth, withdrawalsRoutes);
apiRouter.use("/transactions", requireAuth, transactionsRoutes);
apiRouter.use("/admin", requireAuth, requireAdmin, adminRoutes);

export { apiRouter };
