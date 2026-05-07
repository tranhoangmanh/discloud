import { Router } from "express";
import { ping } from "../services/storage.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const redisOk = await ping();
  if (!redisOk) {
    res.status(503).json({ status: "unhealthy", redis: false });
    return;
  }
  res.json({ status: "ok", redis: true, uptime: process.uptime() });
});
