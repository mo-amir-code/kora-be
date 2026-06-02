import type { Request, Response, NextFunction } from "express";
import type { AsyncHandler } from "../types/index.js";

/**
 * Wraps async route handlers to catch errors and forward to error middleware.
 */
export function asyncWrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
