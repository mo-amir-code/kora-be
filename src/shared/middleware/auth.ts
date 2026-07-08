import type { Request, Response, NextFunction } from "express";
import jwt, { type Secret } from "jsonwebtoken";
import { env } from "../../config/index.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../database/prisma.js";
import { UserPlan } from "../../generated/client/enums.js";

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Auth middleware — extracts and verifies JWT from the Authorization header.
 * Attaches decoded `userId` to `req.userId`.
 * Returns 401 if token is missing or invalid.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(AppError.unauthorized("Missing or invalid authorization header"));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET as Secret);

    if (typeof payload === "string" || !payload.sub) {
      next(AppError.unauthorized("Invalid token payload"));
      return;
    }

    req.userId = payload.sub;
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired token"));
  }
}

/**
 * Pro Plan middleware — requires that the authenticated user has a PRO plan.
 * Must be used AFTER authenticate middleware.
 */
export async function requireProPlan(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    next(AppError.unauthorized("Authentication required"));
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { plan: true },
    });

    if (!user || user.plan !== UserPlan.PRO) {
      next(AppError.forbidden("Pro plan required to access this feature."));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
