import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../utils/app-error.js";

/**
 * Validation middleware — validates req.body, req.query, req.params against a Zod schema.
 * Schema should define { body?, query?, params? } at the top level.
 *
 * Usage in routes:
 *   router.post("/signup", validate(signupSchema), signup);
 */
export function validate(schema: ZodSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const result = await schema.safeParseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const messages = result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
      next(AppError.badRequest(messages.join(", ")));
      return;
    }

    const parsed = result.data as Record<string, unknown>;

    // Only reassign body — query and params are read-only getters in Express 5+
    if (parsed["body"]) {
      req.body = parsed["body"];
    }

    next();
  };
}
