import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { deleteMessage } from "../services/discord.js";
import { deleteFile, getFile, listFiles } from "../services/storage.js";
import { logger } from "../logger.js";

export const filesRouter = Router();

const listQuery = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

filesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
      return;
    }
    const { offset, limit } = parsed.data;
    const { items, total } = await listFiles(offset, limit);
    res.json({
      total,
      offset,
      limit,
      items: items.map(({ parts: _parts, ...rest }) => rest),
    });
  } catch (err) {
    next(err);
  }
});

filesRouter.get("/:id", async (req, res, next) => {
  try {
    const meta = await getFile(req.params.id);
    if (!meta) {
      res.status(404).json({ message: "File not found" });
      return;
    }
    const { parts: _parts, ...rest } = meta;
    res.json(rest);
  } catch (err) {
    next(err);
  }
});

filesRouter.delete("/:id", async (req, res, next) => {
  try {
    const meta = await getFile(req.params.id);
    if (!meta) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    // Best-effort delete the underlying Discord messages.
    await Promise.allSettled(
      meta.parts.map((p) => deleteMessage(config.DISCORD_CHANNEL_ID, p.messageId)),
    );

    const removed = await deleteFile(req.params.id);
    logger.info({ fileId: req.params.id, removed }, "File deleted");
    res.json({ deleted: removed });
  } catch (err) {
    next(err);
  }
});
