import { apiController, AppOk, AppError } from "../../shared/index.js";
import { getPayments, getPaymentStats } from "./payment.service.js";
import type { PaymentFilterQuery } from "./payment.validation.js";

export const list = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const query = req.query as unknown as PaymentFilterQuery;
  const payments = await getPayments(req.userId, query);
  return AppOk.ok({ data: payments });
});

export const stats = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const statistics = await getPaymentStats(req.userId);
  return AppOk.ok({ data: statistics });
});
