import { randomBytes } from "node:crypto";

export const randomId = (length = 16): string => randomBytes(length).toString("hex");
