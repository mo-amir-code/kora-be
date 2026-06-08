import { Router } from "express";
import { authenticate } from "../../shared/index.js";
import { list, create, toggle, remove } from "./reminder.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", list);
router.post("/", create);
router.patch("/:ruleId", toggle);
router.delete("/:ruleId", remove);

export { router as reminderRoutes };
