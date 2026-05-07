import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_CHANNEL_ID: z.string().min(1, "DISCORD_CHANNEL_ID is required"),

  CORS_ORIGINS: z.string().default("*"),
  DISCORD_UPLOAD_CONCURRENCY: z.coerce.number().int().positive().default(2),
  FILE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(0),
  DEFAULT_RANGE_SIZE: z.coerce.number().int().positive().default(5_242_880),
});

export type Config = z.infer<typeof schema> & {
  CORS_ORIGINS_LIST: string[] | "*";
};

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const origins = parsed.data.CORS_ORIGINS.trim();
const corsOriginsList: string[] | "*" =
  origins === "*"
    ? "*"
    : origins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

export const config: Config = {
  ...parsed.data,
  CORS_ORIGINS_LIST: corsOriginsList,
};

export const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB — Discord's hard cap for non-nitro bots
