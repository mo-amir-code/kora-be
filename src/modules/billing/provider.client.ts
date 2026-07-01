import { DodoPayments } from "dodopayments";
import { env } from "../../config/index.js";

export const providerClient = new DodoPayments({
  bearerToken: env.PROVIDER_API_KEY,
  webhookKey: env.PROVIDER_WEBHOOK_KEY,
  environment: env.NODE_ENV === "production" ? "live_mode" : "test_mode",
});
