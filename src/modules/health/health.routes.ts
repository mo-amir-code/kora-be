import { Router } from "express";
import { checkHealth } from "./health.controller.js";

const router = Router();

router.get("/", checkHealth);

export { router as healthRoutes };
