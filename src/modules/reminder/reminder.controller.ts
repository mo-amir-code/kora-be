import { apiController, AppOk, AppError } from "../../shared/index.js";
import { getReminderRules, createReminderRule, toggleReminderRule, deleteReminderRule } from "./reminder.service.js";

export const list = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const rules = await getReminderRules(req.userId);
  return AppOk.ok({ data: rules });
});

export const create = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const rule = await createReminderRule(req.userId, req.body as {
    name?: string;
    triggerType: string;
    offsetValue: number;
    offsetUnit: string;
    nextFollowUps?: string[];
    messageTemplate?: string;
    channelEmail?: boolean;
    channelWhatsapp?: boolean;
    channelPush?: boolean;
  });
  return AppOk.created({ data: rule, message: "Reminder created" });
});

export const toggle = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const ruleId = req.params["ruleId"] as string;
  const { isActive } = req.body as { isActive: boolean };
  const rule = await toggleReminderRule(req.userId, ruleId, isActive);
  return AppOk.ok({ data: rule });
});

export const remove = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const ruleId = req.params["ruleId"] as string;
  await deleteReminderRule(req.userId, ruleId);
  return AppOk.noContent();
});
