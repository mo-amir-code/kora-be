import { Router } from "express";
import { validate, authenticate } from "../../shared/index.js";
import { create, list, getById, update, remove, updateDealDeliverables, addActivity } from "./deal.controller.js";
import { createDealSchema, updateDealSchema } from "./deal.validation.js";

const router = Router();

router.use(authenticate);

router.post("/", validate(createDealSchema), create);
router.get("/", list); // ?stage=LEAD|OUTREACH|... for filtering
router.get("/:dealId", getById);
router.patch("/:dealId", validate(updateDealSchema), update);
router.patch("/:dealId/deliverables", updateDealDeliverables);
router.post("/:dealId/activities", addActivity);
router.delete("/:dealId", remove);

export { router as dealRoutes };
