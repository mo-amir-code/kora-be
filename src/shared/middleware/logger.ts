import morgan from "morgan";
import { env } from "../../config/index.js";

/**
 * Request logger middleware.
 * - Development: detailed colorized output (method, url, status, response time, content length)
 * - Production: raw combined format (Apache-style, machine-parseable for log aggregators)
 */
export const requestLogger = env.NODE_ENV === "development"
  ? morgan("dev")
  : morgan("combined");
