import { Router } from "express";
import { authenticate, requireProPlan } from "../../shared/index.js";
import { list, create, toggle, remove, update } from "./reminder.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/", requireProPlan, create);
router.patch("/:ruleId", requireProPlan, toggle);
router.put("/:ruleId", requireProPlan, update);
router.delete("/:ruleId", requireProPlan, remove);

export { router as reminderRoutes };
