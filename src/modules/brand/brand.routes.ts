import { Router } from "express";
import { validate, authenticate } from "../../shared/index.js";
import {
  create,
  list,
  getById,
  update,
  remove,
  createBrandContact,
  listBrandContacts,
  updateBrandContact,
  removeBrandContact,
} from "./brand.controller.js";
import {
  createBrandSchema,
  updateBrandSchema,
  createContactSchema,
  updateContactSchema,
} from "./brand.validation.js";

const router = Router();

// All brand routes require authentication
router.use(authenticate);

// Brand CRUD
router.post("/", validate(createBrandSchema), create);
router.get("/", list);
router.get("/:brandId", getById);
router.patch("/:brandId", validate(updateBrandSchema), update);
router.delete("/:brandId", remove);

// Brand Contacts (nested under brand)
router.post("/:brandId/contacts", validate(createContactSchema), createBrandContact);
router.get("/:brandId/contacts", listBrandContacts);
router.patch("/:brandId/contacts/:contactId", validate(updateContactSchema), updateBrandContact);
router.delete("/:brandId/contacts/:contactId", removeBrandContact);

export { router as brandRoutes };
