import { Router } from "express";
import { authenticate, validate } from "../../shared/index.js";
import { dashboard } from "./earnings.controller.js";
import { earningsQuerySchema } from "./earnings.validation.js";

const router = Router();

router.use(authenticate);
router.get("/", validate(earningsQuerySchema), dashboard);

export { router as earningsRoutes };
