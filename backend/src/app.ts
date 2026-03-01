import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { asyncHandler } from "./lib/async-handler";
import { stripeWebhookHandler } from "./controllers/stripe.controller";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

const app = express();

app.set("trust proxy", true);
app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin denied"));
    },
    credentials: true
  })
);

app.use(compression());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(stripeWebhookHandler)
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "garmonpay-backend",
    env: env.NODE_ENV
  });
});

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
