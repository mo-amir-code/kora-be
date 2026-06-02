import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/index.js";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.isOperational ? err.message : "Internal Server Error";

  console.error(`[ERROR] ${err.message}`, {
    stack: env.NODE_ENV === "development" ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
}
