import { apiController, AppOk, AppError } from "../../shared/index.js";
import { dashboardService } from "./dashboard.service.js";

/**
 * GET /api/dashboard/home
 */
export const getHome = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }

  const data = await dashboardService.getDashboardHome(req.userId);
  
  return AppOk.ok({ data });
});
