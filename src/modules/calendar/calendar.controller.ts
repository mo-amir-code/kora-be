import { apiController, AppOk, AppError } from "../../shared/index.js";
import { calendarService } from "./calendar.service.js";

export const getEvents = apiController(async (req) => {
  const { startDate: startStr, endDate: endStr } = req.query as {
    startDate?: string;
    endDate?: string;
  };

  if (!startStr || !endStr) {
    throw AppError.badRequest("startDate and endDate query parameters are required.");
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw AppError.badRequest("startDate and endDate must be valid ISO date strings.");
  }

  // Set endDate to the very end of that day (23:59:59.999)
  endDate.setHours(23, 59, 59, 999);

  const events = await calendarService.getEvents(req.userId!, startDate, endDate);
  return AppOk.ok({ data: events });
});
