import axios, { type AxiosInstance } from "axios";
import FormData from "form-data";
import PQueue from "p-queue";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { wait } from "../utils/time.js";
import type { FilePart } from "../types/file.js";

const DISCORD_API = "https://discord.com/api/v10";
const MAX_RETRIES = 5;

interface DiscordAttachment {
  id: string;
  url: string;
  proxy_url?: string;
  size: number;
  filename: string;
}

interface DiscordMessage {
  id: string;
  attachments: DiscordAttachment[];
}

const httpClient: AxiosInstance = axios.create({
  baseURL: DISCORD_API,
  headers: {
    Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`,
  },
  // We are uploading files; allow long timeouts.
  timeout: 5 * 60 * 1000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

const uploadQueue = new PQueue({
  concurrency: config.DISCORD_UPLOAD_CONCURRENCY,
});

const sleepRateLimit = async (resetAfter: number | undefined): Promise<void> => {
  const ms = resetAfter && Number.isFinite(resetAfter) ? Math.ceil(resetAfter * 1000) : 1000;
  await wait(ms);
};

/** Extract the URL expiry timestamp (epoch ms) from a signed Discord CDN URL. */
const parseUrlExpiry = (url: string): number | undefined => {
  try {
    const parsed = new URL(url);
    const ex = parsed.searchParams.get("ex");
    if (!ex) return undefined;
    const seconds = parseInt(ex, 16);
    if (!Number.isFinite(seconds)) return undefined;
    return seconds * 1000;
  } catch {
    return undefined;
  }
};

const attachmentToPart = (attachment: DiscordAttachment, messageId: string): FilePart => ({
  messageId,
  attachmentId: attachment.id,
  size: attachment.size,
  url: attachment.url,
  urlExpiresAt: parseUrlExpiry(attachment.url),
});

interface UploadOpts {
  channelId: string;
  buffer: Buffer;
  fileName: string;
}

export const uploadChunk = async ({
  channelId,
  buffer,
  fileName,
}: UploadOpts): Promise<FilePart> => {
  const task = async (): Promise<FilePart> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const formData = new FormData();
        formData.append("files[0]", buffer, { filename: fileName });

        const { data } = await httpClient.post<DiscordMessage>(
          `/channels/${channelId}/messages`,
          formData,
          {
            headers: formData.getHeaders(),
          },
        );

        const attachment = data.attachments[0];
        if (!attachment) throw new Error("Discord response missing attachment");
        return attachmentToPart(attachment, data.id);
      } catch (err) {
        lastError = err;
        if (axios.isAxiosError(err) && err.response?.status === 429) {
          const resetAfter = Number(
            err.response.headers["x-ratelimit-reset-after"] ?? err.response.data?.retry_after ?? 1,
          );
          logger.warn(
            { resetAfter, attempt, fileName },
            "Discord rate limit hit, waiting before retry",
          );
          await sleepRateLimit(resetAfter);
          continue;
        }
        // Exponential backoff for other errors
        const backoff = Math.min(2 ** attempt * 500, 5000);
        logger.warn({ attempt, backoff, err: (err as Error).message }, "Upload retry");
        await wait(backoff);
      }
    }
    throw lastError ?? new Error("Upload failed after retries");
  };

  const result = await uploadQueue.add(task);
  if (!result) throw new Error("Upload task was cancelled");
  return result;
};

/**
 * Re-fetch a Discord message to get fresh signed attachment URLs (~24h validity).
 * Use this when a stored URL has expired.
 */
export const refreshAttachmentUrl = async (
  channelId: string,
  part: FilePart,
): Promise<FilePart> => {
  const { data } = await httpClient.get<DiscordMessage>(
    `/channels/${channelId}/messages/${part.messageId}`,
  );

  const attachment =
    (part.attachmentId && data.attachments.find((a) => a.id === part.attachmentId)) ||
    data.attachments[0];

  if (!attachment) {
    throw new Error(`Cannot refresh attachment for message ${part.messageId}`);
  }

  return {
    ...part,
    attachmentId: attachment.id,
    size: attachment.size,
    url: attachment.url,
    urlExpiresAt: parseUrlExpiry(attachment.url),
  };
};

/** Returns true if the cached URL is missing or near expiry (60s buffer). */
export const isPartUrlStale = (part: FilePart): boolean => {
  if (!part.url) return true;
  if (!part.urlExpiresAt) return false;
  return Date.now() >= part.urlExpiresAt - 60_000;
};

/** Best-effort delete: ignore 404 (already gone). */
export const deleteMessage = async (channelId: string, messageId: string): Promise<void> => {
  try {
    await httpClient.delete(`/channels/${channelId}/messages/${messageId}`);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return;
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      const resetAfter = Number(
        err.response.headers["x-ratelimit-reset-after"] ?? err.response.data?.retry_after ?? 1,
      );
      await sleepRateLimit(resetAfter);
      await deleteMessage(channelId, messageId);
      return;
    }
    logger.warn({ messageId, err: (err as Error).message }, "Failed to delete Discord message");
  }
};

export { parseUrlExpiry };
