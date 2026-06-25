import { Router } from "express";
import * as dashboardController from "./dashboard.controller.js";
import { authenticate } from "../../shared/index.js";

const router = Router();

/**
 * @route GET /api/dashboard/home
 * @desc Get dashboard home data (deadlines, stats, etc.)
 * @access Private
 */
router.get("/home", authenticate, dashboardController.getHome);

export default router;
