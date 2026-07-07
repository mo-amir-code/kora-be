import { Router } from "express";
import { authenticate, validate } from "../../shared/index.js";
import {
  createCheckoutSession,
  changePlan,
  cancelSubscription,
  grantPromoAccess,
  handleWebhook,
  getCurrentPlan
} from "./billing.controller.js";
import {
  createCheckoutSessionSchema,
  changePlanSchema,
  grantPromoAccessSchema
} from "./billing.validation.js";

const router = Router();

router.get("/current-plan", authenticate, getCurrentPlan);
router.post("/checkout", authenticate, validate(createCheckoutSessionSchema), createCheckoutSession);
router.post("/change-plan", authenticate, validate(changePlanSchema), changePlan);
router.post("/cancel", authenticate, cancelSubscription);
router.post("/promo-access", validate(grantPromoAccessSchema), grantPromoAccess);
router.post("/webhook", handleWebhook);

export { router as billingRoutes };
