import { Router } from "express";
import { authenticate, validate } from "../../shared/index.js";
import * as controller from "./payment.controller.js";
import { paymentFilterSchema } from "./payment.validation.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(paymentFilterSchema), controller.list);
router.get("/stats", controller.stats);
router.post("/events", controller.createEvent);

export default router;
