import { Router } from "express";
import { authenticate } from "../../shared/index.js";
import { getTransactions } from "./transaction.controller.js";

const router = Router();

router.get("/", authenticate, getTransactions);

export { router as transactionRoutes };
