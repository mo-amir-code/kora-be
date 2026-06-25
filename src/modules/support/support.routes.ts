import { Router } from "express";
import { validate, authenticate } from "../../shared/index.js";
import { submitInquiry } from "./support.controller.js";
import { submitInquirySchema } from "./support.validation.js";

const router = Router();

router.use(authenticate);

// POST /api/support
router.post("/", validate(submitInquirySchema), submitInquiry);

export default router;
