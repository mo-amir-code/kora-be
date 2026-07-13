import crypto from "node:crypto";
import { apiController, AppError } from "../../shared/index.js";
import { env } from "../../config/index.js";
import { billingService } from "./billing.service.js";

export const createCheckoutSession = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const { billingCycle } = req.body;
  const result = await billingService.createCheckoutSession(req.userId, billingCycle);
  return { data: result, message: "Checkout session created successfully" };
});

export const changePlan = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const { billingCycle } = req.body;
  const result = await billingService.changePlan(req.userId, billingCycle);
  return { data: result, message: "Plan change initiated successfully" };
});

export const cancelSubscription = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const result = await billingService.cancelSubscription(req.userId);
  return { data: result, message: "Subscription cancelled successfully" };
});

export const resumeSubscription = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const result = await billingService.resumeSubscription(req.userId);
  return { data: result, message: "Subscription resumed successfully" };
});


export const grantPromoAccess = apiController(async (req) => {
  const adminKey = req.headers["x-admin-key"];
  if (typeof adminKey !== "string") {
    throw AppError.forbidden("Invalid request");
  }

  const keyBuffer = Buffer.from(adminKey);
  const secretBuffer = Buffer.from(env.ADMIN_SECRET_KEY);

  if (
    keyBuffer.length !== secretBuffer.length ||
    !crypto.timingSafeEqual(keyBuffer, secretBuffer)
  ) {
    throw AppError.forbidden("Invalid request");
  }

  const { targetUserId, plan, durationDays } = req.body;
  const result = await billingService.grantPromoAccess(targetUserId, plan, durationDays);
  return { data: result, message: "Promotional access granted successfully" };
});


export const handleWebhook = apiController(async (req) => {
  const rawBody = (req as any).rawBody?.toString("utf8");
  if (!rawBody) {
    throw AppError.badRequest("Missing raw body for webhook verification");
  }
  const headers = req.headers as Record<string, string>;
  await billingService.handleWebhook(rawBody, headers);
  return { message: "Webhook processed successfully" };
});

export const getCurrentPlan = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const result = await billingService.getCurrentPlan(req.userId);
  return { data: result, message: "Current subscription plan retrieved successfully" };
});
