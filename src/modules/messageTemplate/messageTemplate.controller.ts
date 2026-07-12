import { apiController, AppOk, AppError } from "../../shared/index.js";
import { messageTemplateService } from "./messageTemplate.service.js";
import { MessageTemplateCategory } from "../../generated/client/enums.js";

export const listTemplates = apiController(async (req) => {
  const category = req.query["category"] as MessageTemplateCategory | undefined;
  const templates = await messageTemplateService.listTemplates(req.userId!, category);
  return AppOk.ok({ data: templates });
});

export const createTemplate = apiController(async (req) => {
  const template = await messageTemplateService.createTemplate(req.userId!, req.body);
  return AppOk.created({ data: template });
});

export const updateTemplate = apiController(async (req) => {
  const id = req.params["id"] as string;
  if (!id) throw AppError.badRequest("Template ID is required");
  const template = await messageTemplateService.updateTemplate(req.userId!, id, req.body);
  return AppOk.ok({ data: template });
});

export const deleteTemplate = apiController(async (req) => {
  const id = req.params["id"] as string;
  if (!id) throw AppError.badRequest("Template ID is required");
  await messageTemplateService.deleteTemplate(req.userId!, id);
  return AppOk.noContent();
});

export const getTemplate = apiController(async (req) => {
  const id = req.params["id"] as string;
  if (!id) throw AppError.badRequest("Template ID is required");
  const template = await messageTemplateService.getTemplate(req.userId!, id);
  if (!template) throw AppError.notFound("Template not found");
  return AppOk.ok({ data: template });
});
