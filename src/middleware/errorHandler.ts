import type { ErrorRequestHandler } from "express";
import { logger } from "../logger.js";
import { RangeNotSatisfiableError } from "../utils/range.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof RangeNotSatisfiableError) {
    res.status(416).json({ message: err.message });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Request failed");

  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(500).json({ message: "Internal server error" });
};
