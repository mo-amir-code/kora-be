import { apiController, AppOk, AppError } from "../../shared/index.js";
import { createDeal, getDeals, getDealById, updateDeal, deleteDeal, updateDeliverables, createDealActivity } from "./deal.service.js";
import type { CreateDealBody, UpdateDealBody } from "./deal.validation.js";

export const create = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const deal = await createDeal(req.userId, req.body as CreateDealBody);
  return AppOk.created({ data: deal, message: "Deal created" });
});

export const list = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const stage = req.query["stage"] as string | undefined;
  const deals = await getDeals(req.userId, stage);
  return AppOk.ok({ data: deals });
});

export const getById = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const dealId = req.params["dealId"] as string;
  const deal = await getDealById(req.userId, dealId);
  return AppOk.ok({ data: deal });
});

export const update = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const dealId = req.params["dealId"] as string;
  const deal = await updateDeal(req.userId, dealId, req.body as UpdateDealBody);
  return AppOk.ok({ data: deal, message: "Deal updated" });
});

export const remove = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const dealId = req.params["dealId"] as string;
  await deleteDeal(req.userId, dealId);
  return AppOk.noContent();
});

export const updateDealDeliverables = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const dealId = req.params["dealId"] as string;
  const updates = req.body as { id: string; isCompleted: boolean }[];
  const deal = await updateDeliverables(req.userId, dealId, updates);
  return AppOk.ok({ data: deal, message: "Deliverables updated" });
});

export const addActivity = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const dealId = req.params["dealId"] as string;
  const { type, body } = req.body as { type: string; body: string };
  const deal = await createDealActivity(req.userId, dealId, type, body);
  return AppOk.created({ data: deal, message: "Activity logged" });
});
