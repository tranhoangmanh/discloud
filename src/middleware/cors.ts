import cors, { type CorsOptions } from "cors";
import { config } from "../config.js";

export const buildCors = () => {
  const list = config.CORS_ORIGINS_LIST;

  if (list === "*") {
    return cors({ origin: true });
  }

  const allow = new Set(list);
  const options: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allow.has(origin));
    },
  };
  return cors(options);
};
