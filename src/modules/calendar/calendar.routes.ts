import { Router } from "express";
import * as calendarController from "./calendar.controller.js";
import { authenticate } from "../../shared/index.js";

const router = Router();

router.get("/", authenticate, calendarController.getEvents);

export default router;
