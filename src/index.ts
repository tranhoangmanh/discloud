import { buildApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { closeStorage, initStorage } from "./services/storage.js";

const main = async (): Promise<void> => {
  await initStorage();
  const app = buildApp();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, `Server listening on http://localhost:${config.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close();
    await closeStorage();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
