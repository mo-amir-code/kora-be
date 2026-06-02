import { apiController, AppOk } from "../../shared/index.js";
import { env } from "../../config/index.js";

export const checkHealth = apiController((req, res, next) => {
  return AppOk.ok({
    data: {
      status: "ok",
      environment: env.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});
