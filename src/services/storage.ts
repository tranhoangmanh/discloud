import { createClient, type RedisClientType } from "redis";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { FileMetadata, UploadSession } from "../types/file.js";

const FILE_PREFIX = "discloud:file:";
const SESSION_PREFIX = "discloud:session:";
const FILE_INDEX = "discloud:files";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h to finish an upload

let client: RedisClientType | null = null;

export const initStorage = async (): Promise<RedisClientType> => {
  if (client) return client;
  const c: RedisClientType = createClient({ url: config.REDIS_URL });
  c.on("error", (err) => logger.error({ err }, "Redis error"));
  await c.connect();
  client = c;
  logger.info("Connected to Redis");
  return c;
};

export const closeStorage = async (): Promise<void> => {
  if (client) {
    await client.quit();
    client = null;
  }
};

const getClient = (): RedisClientType => {
  if (!client) throw new Error("Storage not initialized");
  return client;
};

export const ping = async (): Promise<boolean> => {
  try {
    const reply = await getClient().ping();
    return reply === "PONG";
  } catch {
    return false;
  }
};

// --- File metadata ----------------------------------------------------------

export const saveFile = async (meta: FileMetadata, ttlSeconds = 0): Promise<void> => {
  const c = getClient();
  const key = FILE_PREFIX + meta.fileId;
  const value = JSON.stringify(meta);

  if (ttlSeconds > 0) {
    await c.set(key, value, { EX: ttlSeconds });
  } else {
    await c.set(key, value);
  }
  await c.zAdd(FILE_INDEX, { score: meta.createdAt, value: meta.fileId });
};

export const getFile = async (fileId: string): Promise<FileMetadata | null> => {
  const raw = await getClient().get(FILE_PREFIX + fileId);
  return raw ? (JSON.parse(raw) as FileMetadata) : null;
};

export const updateFile = async (meta: FileMetadata): Promise<void> => {
  const c = getClient();
  const key = FILE_PREFIX + meta.fileId;
  // Preserve existing TTL where possible.
  const ttl = await c.ttl(key);
  const value = JSON.stringify(meta);
  if (ttl > 0) {
    await c.set(key, value, { EX: ttl });
  } else {
    await c.set(key, value);
  }
};

export const deleteFile = async (fileId: string): Promise<boolean> => {
  const c = getClient();
  const removed = await c.del(FILE_PREFIX + fileId);
  await c.zRem(FILE_INDEX, fileId);
  return removed > 0;
};

export const listFiles = async (
  offset = 0,
  limit = 50,
): Promise<{ items: FileMetadata[]; total: number }> => {
  const c = getClient();
  const total = await c.zCard(FILE_INDEX);
  const ids = await c.zRange(FILE_INDEX, offset, offset + limit - 1, { REV: true });
  if (ids.length === 0) return { items: [], total };

  const keys = ids.map((id) => FILE_PREFIX + id);
  const values = await c.mGet(keys);
  const items = values
    .filter((v): v is string => Boolean(v))
    .map((v) => JSON.parse(v) as FileMetadata);

  // Cleanup index entries pointing to expired keys
  const missing = ids.filter((_, i) => values[i] === null);
  if (missing.length > 0) {
    await c.zRem(FILE_INDEX, missing);
  }

  return { items, total };
};

// --- Upload sessions --------------------------------------------------------

export const saveSession = async (session: UploadSession): Promise<void> => {
  await getClient().set(SESSION_PREFIX + session.uploadId, JSON.stringify(session), {
    EX: SESSION_TTL_SECONDS,
  });
};

export const getSession = async (uploadId: string): Promise<UploadSession | null> => {
  const raw = await getClient().get(SESSION_PREFIX + uploadId);
  return raw ? (JSON.parse(raw) as UploadSession) : null;
};

export const deleteSession = async (uploadId: string): Promise<void> => {
  await getClient().del(SESSION_PREFIX + uploadId);
};
