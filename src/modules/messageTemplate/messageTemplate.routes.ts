import { Router } from "express";
import * as controller from "./messageTemplate.controller.js";
import * as validation from "./messageTemplate.validation.js";
import { validate, authenticate } from "../../shared/index.js";

const router = Router();

// All template routes require authentication
router.use(authenticate);

router.get(
  "/",
  validate(validation.listTemplatesSchema),
  controller.listTemplates
);

router.get(
  "/:id",
  controller.getTemplate
);

router.post(
  "/",
  validate(validation.createTemplateSchema),
  controller.createTemplate
);

router.patch(
  "/:id",
  validate(validation.updateTemplateSchema),
  controller.updateTemplate
);

router.delete(
  "/:id",
  controller.deleteTemplate
);

export default router;
