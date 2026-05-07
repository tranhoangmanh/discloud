import { Router, type Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import mime from "mime-types";
import { CHUNK_SIZE, config } from "../config.js";
import { logger } from "../logger.js";
import { uploadChunk } from "../services/discord.js";
import { deleteSession, getSession, saveFile, saveSession } from "../services/storage.js";
import { publish, subscribe } from "../services/progress.js";
import type { FileMetadata, FilePart, UploadSession } from "../types/file.js";
import { randomId } from "../utils/id.js";
import { formatFileName } from "../utils/string.js";

export const uploadRouter = Router();

const MAX_PENDING_PARTS = 4; // Backpressure threshold.

const buildPublicUrls = (req: Request, fileId: string, fileName: string) => {
  const base = `${req.protocol}://${req.get("host")}`;
  return {
    url: `${base}/file/${fileId}`,
    longURL: `${base}/file/${fileId}/${fileName}`,
    downloadURL: `${base}/file/${fileId}?download=1`,
    longDownloadURL: `${base}/file/${fileId}/${fileName}?download=1`,
  };
};

interface StreamUploadOpts {
  req: Request;
  fileName: string;
  contentType: string;
  uploadId?: string;
  initialParts?: FilePart[];
  initialBytes?: number;
  hash?: ReturnType<typeof createHash>;
}

interface StreamUploadResult {
  parts: FilePart[];
  fileSize: number;
  sha256: string;
}

/**
 * Stream a request body, slice it into CHUNK_SIZE buffers, and upload each
 * one to Discord with bounded concurrency. Applies backpressure on the
 * incoming request when too many parts are queued.
 */
const streamUpload = ({
  req,
  fileName,
  contentType: _contentType,
  uploadId,
  initialParts = [],
  initialBytes = 0,
  hash = createHash("sha256"),
}: StreamUploadOpts): Promise<StreamUploadResult> =>
  new Promise((resolve, reject) => {
    const channelId = config.DISCORD_CHANNEL_ID;
    const parts: FilePart[] = [...initialParts];
    let buffers: Buffer[] = [];
    let bufferLen = 0;
    let totalBytes = initialBytes;
    let partIndex = initialParts.length;
    let pending = 0;
    let requestEnded = false;
    let requestPaused = false;
    let settled = false;
    const errors: Error[] = [];

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      errors.push(err);
      reject(err);
    };

    const tryResume = () => {
      if (requestPaused && pending < MAX_PENDING_PARTS) {
        requestPaused = false;
        req.resume();
      }
    };

    const maybeFinish = () => {
      if (settled) return;
      if (requestEnded && pending === 0) {
        settled = true;
        resolve({
          parts,
          fileSize: totalBytes,
          sha256: hash.digest("hex"),
        });
      }
    };

    const dispatch = (chunk: Buffer): void => {
      pending++;
      const slot = partIndex++;
      const partFileName = `${fileName}-chunk-${slot + 1}`;

      uploadChunk({ channelId, buffer: chunk, fileName: partFileName })
        .then((part) => {
          parts[slot] = part;
          if (uploadId) {
            publish(uploadId, "progress", {
              uploadedBytes: parts.reduce((sum, p) => sum + (p?.size ?? 0), 0),
              partsUploaded: parts.filter(Boolean).length,
            });
          }
        })
        .catch((err: Error) => fail(err))
        .finally(() => {
          pending--;
          tryResume();
          maybeFinish();
        });

      if (pending >= MAX_PENDING_PARTS && !requestPaused) {
        requestPaused = true;
        req.pause();
      }
    };

    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      hash.update(chunk);
      buffers.push(chunk);
      bufferLen += chunk.length;
      totalBytes += chunk.length;

      while (bufferLen >= CHUNK_SIZE) {
        const full = Buffer.concat(buffers, bufferLen);
        const first = full.subarray(0, CHUNK_SIZE);
        const rest = full.subarray(CHUNK_SIZE);
        buffers = rest.length ? [Buffer.from(rest)] : [];
        bufferLen = rest.length;
        dispatch(first);
      }
    });

    req.on("end", () => {
      requestEnded = true;
      if (bufferLen > 0) {
        const tail = Buffer.concat(buffers, bufferLen);
        buffers = [];
        bufferLen = 0;
        dispatch(tail);
      } else {
        maybeFinish();
      }
    });

    req.on("error", fail);
    req.on("aborted", () => fail(new Error("Request aborted")));
  });

const directUploadQuery = z.object({
  fileName: z.string().min(1).max(255),
});

uploadRouter.post("/upload", async (req, res, next) => {
  try {
    const parsed = directUploadQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Missing or invalid fileName" });
      return;
    }
    const fileName = formatFileName(parsed.data.fileName);
    const contentType =
      req.header("content-type") || mime.lookup(fileName) || "application/octet-stream";
    const uploadId = typeof req.query.uploadId === "string" ? req.query.uploadId : undefined;

    const { parts, fileSize, sha256 } = await streamUpload({
      req,
      fileName,
      contentType,
      uploadId,
    });

    const fileId = randomId();
    const meta: FileMetadata = {
      fileId,
      fileName,
      fileSize,
      contentType,
      chunkSize: CHUNK_SIZE,
      sha256,
      parts,
      createdAt: Date.now(),
    };
    await saveFile(meta, config.FILE_TTL_SECONDS);

    if (uploadId) {
      publish(uploadId, "complete", { fileId });
    }

    const urls = buildPublicUrls(req, fileId, fileName);
    res.json({
      fileId,
      fileSize,
      sha256,
      contentType,
      ...urls,
      parts: parts.map((p) => p.url),
    });
  } catch (err) {
    next(err);
  }
});

// --- Resumable upload sessions ---------------------------------------------

const initSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().optional(),
  contentType: z.string().optional(),
});

uploadRouter.post("/upload/init", async (req, res, next) => {
  try {
    let body: unknown = req.body;
    if (!body || (typeof body === "object" && Object.keys(body as object).length === 0)) {
      // Allow ?fileName=... query for clients that prefer it.
      body = req.query;
    }
    const parsed = initSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      return;
    }
    const fileName = formatFileName(parsed.data.fileName);
    const contentType =
      parsed.data.contentType || mime.lookup(fileName) || "application/octet-stream";

    const session: UploadSession = {
      uploadId: randomId(),
      fileName,
      contentType,
      ...(parsed.data.fileSize !== undefined ? { declaredSize: parsed.data.fileSize } : {}),
      uploadedBytes: 0,
      parts: [],
      createdAt: Date.now(),
    };
    await saveSession(session);
    res.status(201).json({
      uploadId: session.uploadId,
      fileName: session.fileName,
      contentType: session.contentType,
      uploadedBytes: 0,
      progressUrl: `${req.protocol}://${req.get("host")}/upload/${session.uploadId}/events`,
    });
  } catch (err) {
    next(err);
  }
});

uploadRouter.post("/upload/:uploadId", async (req, res, next) => {
  try {
    const session = await getSession(req.params.uploadId);
    if (!session) {
      res.status(404).json({ message: "Upload session not found or expired" });
      return;
    }

    const { parts, fileSize, sha256 } = await streamUpload({
      req,
      fileName: session.fileName,
      contentType: session.contentType,
      uploadId: session.uploadId,
      initialParts: session.parts,
      initialBytes: session.uploadedBytes,
    });

    session.parts = parts;
    session.uploadedBytes = fileSize;
    session.hashState = sha256;
    await saveSession(session);

    res.json({
      uploadId: session.uploadId,
      uploadedBytes: session.uploadedBytes,
      partsUploaded: session.parts.length,
    });
  } catch (err) {
    next(err);
  }
});

uploadRouter.post("/upload/:uploadId/complete", async (req, res, next) => {
  try {
    const session = await getSession(req.params.uploadId);
    if (!session) {
      res.status(404).json({ message: "Upload session not found or expired" });
      return;
    }
    if (session.parts.length === 0) {
      res.status(400).json({ message: "No data uploaded yet" });
      return;
    }

    const fileId = randomId();
    const meta: FileMetadata = {
      fileId,
      fileName: session.fileName,
      fileSize: session.uploadedBytes,
      contentType: session.contentType,
      chunkSize: CHUNK_SIZE,
      ...(session.hashState ? { sha256: session.hashState } : {}),
      parts: session.parts,
      createdAt: Date.now(),
    };
    await saveFile(meta, config.FILE_TTL_SECONDS);
    await deleteSession(session.uploadId);
    publish(session.uploadId, "complete", { fileId });

    const urls = buildPublicUrls(req, fileId, session.fileName);
    res.json({
      fileId,
      fileSize: session.uploadedBytes,
      sha256: session.hashState,
      contentType: session.contentType,
      ...urls,
    });
  } catch (err) {
    next(err);
  }
});

uploadRouter.get("/upload/:uploadId", async (req, res, next) => {
  try {
    const session = await getSession(req.params.uploadId);
    if (!session) {
      res.status(404).json({ message: "Upload session not found or expired" });
      return;
    }
    res.json({
      uploadId: session.uploadId,
      fileName: session.fileName,
      contentType: session.contentType,
      declaredSize: session.declaredSize,
      uploadedBytes: session.uploadedBytes,
      partsUploaded: session.parts.length,
    });
  } catch (err) {
    next(err);
  }
});

uploadRouter.delete("/upload/:uploadId", async (req, res, next) => {
  try {
    await deleteSession(req.params.uploadId);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

uploadRouter.get("/upload/:uploadId/events", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  // Heartbeat every 25s to keep the connection alive through proxies.
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
  });

  subscribe(req.params.uploadId, res);
  logger.debug({ uploadId: req.params.uploadId }, "SSE subscriber attached");
});
