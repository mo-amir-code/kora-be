import { Router } from "express";
import { authenticate, validate } from "../../shared/index.js";
import * as userController from "./user.controller.js";
import { updateMeSchema } from "./user.validation.js";

const router = Router();

router.get("/me", authenticate, userController.getMe);
router.patch("/me", authenticate, validate(updateMeSchema), userController.updateMe);
router.patch("/settings/invoice", authenticate, userController.updateInvoiceSettings);

export { router as userRoutes };
