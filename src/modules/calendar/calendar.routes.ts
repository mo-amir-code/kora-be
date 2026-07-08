import { Router } from "express";
import * as calendarController from "./calendar.controller.js";
import { authenticate, requireProPlan } from "../../shared/index.js";

const router = Router();

router.get("/", authenticate, requireProPlan, calendarController.getEvents);

export default router;
