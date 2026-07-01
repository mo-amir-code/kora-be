import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
  body: z.object({
    billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  }),
});

export const changePlanSchema = z.object({
  body: z.object({
    billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  }),
});

export const grantPromoAccessSchema = z.object({
  body: z.object({
    targetUserId: z.string().uuid("targetUserId must be a valid UUID"),
    plan: z.enum(["FREE", "PRO"]),
    durationDays: z.number().int().min(1).optional().default(30),
  }),
});
