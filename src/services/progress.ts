import type { Response } from "express";

/**
 * Server-Sent Events broker for upload progress.
 * Subscribers tail an uploadId; publishers push events as bytes are processed.
 */
type Subscriber = Response;

const channels = new Map<string, Set<Subscriber>>();

export const subscribe = (uploadId: string, res: Response): void => {
  let set = channels.get(uploadId);
  if (!set) {
    set = new Set();
    channels.set(uploadId, set);
  }
  set.add(res);

  res.on("close", () => {
    set?.delete(res);
    if (set && set.size === 0) channels.delete(uploadId);
  });
};

export const publish = (uploadId: string, event: string, data: unknown): void => {
  const set = channels.get(uploadId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // Subscriber may have disconnected — cleanup happens via 'close' handler.
    }
  }
};

export const closeChannel = (uploadId: string): void => {
  const set = channels.get(uploadId);
  if (!set) return;
  for (const res of set) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  channels.delete(uploadId);
};
