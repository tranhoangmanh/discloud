import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
  redact: {
    paths: ["req.headers.authorization", 'req.headers["x-api-key"]', "DISCORD_BOT_TOKEN"],
    censor: "[REDACTED]",
  },
});
