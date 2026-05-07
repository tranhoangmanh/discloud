import axios from "axios";
import { Router } from "express";
import mime from "mime-types";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { isPartUrlStale, refreshAttachmentUrl } from "../services/discord.js";
import { getFile, updateFile } from "../services/storage.js";
import { encodeContentDispositionFilename } from "../utils/string.js";
import { AsyncStreamProcessor } from "../utils/stream.js";
import { RangeNotSatisfiableError, computePartSlices, parseRangeHeader } from "../utils/range.js";
import type { FileMetadata, FilePart } from "../types/file.js";

export const downloadRouter = Router();

const ensureFreshUrl = async (
  meta: FileMetadata,
  partIndex: number,
): Promise<{ part: FilePart; refreshed: boolean }> => {
  const part = meta.parts[partIndex];
  if (!part) throw new Error(`Part ${partIndex} not found`);
  if (!isPartUrlStale(part)) return { part, refreshed: false };

  const fresh = await refreshAttachmentUrl(config.DISCORD_CHANNEL_ID, part);
  meta.parts[partIndex] = fresh;
  return { part: fresh, refreshed: true };
};

downloadRouter.get(["/file/:id/*", "/file/:id"], async (req, res, next) => {
  try {
    const meta = await getFile(req.params.id);
    if (!meta) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const isDownload = String(req.query.download || "") !== "" && req.query.download !== "0";
    const contentType =
      meta.contentType || mime.lookup(meta.fileName) || "application/octet-stream";

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (meta.sha256) {
      res.setHeader("ETag", `"${meta.sha256}"`);
    }
    if (isDownload) {
      res.setHeader("Content-Disposition", encodeContentDispositionFilename(meta.fileName));
    }

    if (meta.sha256 && req.headers["if-none-match"] === `"${meta.sha256}"`) {
      res.status(304).end();
      return;
    }

    let parsedRange = null;
    try {
      parsedRange = parseRangeHeader(req.headers.range, meta.fileSize, config.DEFAULT_RANGE_SIZE);
    } catch (err) {
      if (err instanceof RangeNotSatisfiableError) {
        res.setHeader("Content-Range", `bytes */${meta.fileSize}`);
        res.status(416).json({ message: err.message });
        return;
      }
      throw err;
    }

    const slices = parsedRange
      ? computePartSlices(parsedRange, meta.chunkSize, meta.parts.length)
      : meta.parts.map((_, i) => ({ index: i }) as { index: number; start?: number; end?: number });

    if (parsedRange) {
      res.status(206);
      res.setHeader("Content-Length", String(parsedRange.end - parsedRange.start + 1));
      res.setHeader(
        "Content-Range",
        `bytes ${parsedRange.start}-${parsedRange.end}/${meta.fileSize}`,
      );
    } else {
      res.setHeader("Content-Length", String(meta.fileSize));
    }

    let metaDirty = false;

    for (const slice of slices) {
      const { part, refreshed } = await ensureFreshUrl(meta, slice.index);
      if (refreshed) metaDirty = true;

      const headers: Record<string, string> = {};
      if (slice.start !== undefined || slice.end !== undefined) {
        headers["Range"] = `bytes=${slice.start ?? 0}-${slice.end ?? ""}`;
      }

      if (!part.url) throw new Error(`Missing URL for part ${slice.index}`);

      await new Promise<void>((resolve, reject) => {
        axios
          .get(part.url!, { headers, responseType: "stream" })
          .then((response) => {
            response.data.pipe(
              new AsyncStreamProcessor(async (data) => {
                if (!res.write(data)) {
                  await new Promise<void>((r) => res.once("drain", () => r()));
                }
              }),
            );
            response.data.on("error", reject);
            response.data.on("end", () => resolve());
          })
          .catch(reject);
      });
    }

    if (metaDirty) {
      // Persist refreshed URLs so future requests don't refetch.
      try {
        await updateFile(meta);
      } catch (err) {
        logger.warn({ err }, "Failed to persist refreshed URLs");
      }
    }

    res.end();
  } catch (err) {
    next(err);
  }
});
