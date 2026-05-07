import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import type { Request } from "express";
import { logger } from "./logger.js";
import { buildCors } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { downloadRouter } from "./routes/download.js";
import { filesRouter } from "./routes/files.js";
import { healthRouter } from "./routes/health.js";
import { uploadRouter } from "./routes/upload.js";

export const buildApp = () => {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(__dirname, "..", "static");

  app.disable("x-powered-by");
  app.enable("trust proxy");
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req: Request) => req.url === "/health" },
    }),
  );
  app.use(buildCors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  app.use("/static", express.static(staticDir));

  app.use("/health", healthRouter);
  app.use("/files", filesRouter);
  app.use(uploadRouter); // mounts /upload, /upload/:id, etc.
  app.use(downloadRouter); // mounts /file/:id

  app.use(errorHandler);

  return app;
};
