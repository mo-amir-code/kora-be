import { apiController, AppOk, AppError } from "../../shared/index.js";
import { getPayments, getPaymentStats, createPaymentEvent } from "./payment.service.js";
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

export const createEvent = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const body = req.body;
  if (!body.dealId || !body.amount || !body.type) {
    throw AppError.badRequest("dealId, amount, and type are required");
  }
  const event = await createPaymentEvent(req.userId, {
    dealId: body.dealId,
    invoiceId: body.invoiceId,
    type: body.type,
    amount: Number(body.amount),
    method: body.method,
    reference: body.reference,
    paidAt: body.paidAt
  });
  return AppOk.created({ data: event });
});
