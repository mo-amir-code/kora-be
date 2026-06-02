import type { Request, Response, NextFunction } from "express";
import { AppError } from "./app-error.js";

/**
 * The shape your controller handler returns.
 * All fields are optional — you can return an empty object {}.
 */
export interface ControllerResult<T = unknown> {
  data?: T;
  message?: string;
  statusCode?: number;
}

/**
 * A controller handler function. Receives req, res, next and returns a result.
 * Throw AppError for error responses — the wrapper handles everything else.
 */
export type ControllerHandler<T = unknown> = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<ControllerResult<T>> | ControllerResult<T>;

/**
 * Wraps a controller handler so you never have to:
 * - Write try/catch
 * - Call res.json() manually
 * - Structure the { success, data, message } envelope
 * - Handle error formatting
 *
 * Usage:
 *   router.get("/", apiController(async (req, res, next) => {
 *     const users = await userService.findAll();
 *     return { data: users };
 *   }));
 */
export function apiController<T = unknown>(handler: ControllerHandler<T>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await handler(req, res, next);
      const status = result.statusCode ?? 200;

      if (status === 204) {
        res.status(204).end();
        return;
      }

      const response: Record<string, unknown> = { success: true };
      if (result.message !== undefined) response["message"] = result.message;
      if (result.data !== undefined) response["data"] = result.data;

      res.status(status).json(response);
    } catch (error: unknown) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Unexpected errors — pass to global error handler
      next(error);
    }
  };
}
