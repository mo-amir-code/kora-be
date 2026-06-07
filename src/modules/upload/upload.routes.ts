import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../shared/index.js";
import { upload } from "./upload.controller.js";

const router = Router();
const multerUpload = multer({ storage: multer.memoryStorage() });

// All upload routes require authentication
router.use(authenticate);

// Single upload endpoint — doc-id header determines folder + allowed types
router.post("/", multerUpload.single("file"), upload);

export { router as uploadRoutes };
