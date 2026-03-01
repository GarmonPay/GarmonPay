import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const server = app.listen(env.PORT, () => {
  logger.info(`GarmonPay backend listening on :${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals) {
  logger.info(`Received ${signal}, shutting down`);
  server.close((error) => {
    if (error) {
      logger.error("Server shutdown error", error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
