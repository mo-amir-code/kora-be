import { apiController, AppError, AppOk } from "../../shared/index.js";
import { getEarningsDashboard } from "./earnings.service.js";
import type { EarningsQuery } from "./earnings.validation.js";
import { DealCurrency } from "../../generated/client/enums.js";

export const dashboard = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const query = req.query as unknown as EarningsQuery;
  const data = await getEarningsDashboard(req.userId, {
    month: query.month,
    currency: query.currency ?? DealCurrency.INR,
    filter: query.filter ?? "expected",
  });
  return AppOk.ok({ data });
});
