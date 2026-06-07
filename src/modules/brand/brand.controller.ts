import { apiController, AppOk, AppError } from "../../shared/index.js";
import {
  createBrand,
  getBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  createContact,
  getContacts,
  updateContact,
  deleteContact,
} from "./brand.service.js";
import type { CreateBrandBody, UpdateBrandBody, CreateContactBody, UpdateContactBody } from "./brand.validation.js";

// ─── BRANDS ─────────────────────────────────────────────────────────────────────

export const create = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brand = await createBrand(req.userId, req.body as CreateBrandBody);
  return AppOk.created({ data: brand, message: "Brand created" });
});

export const list = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brands = await getBrands(req.userId);
  return AppOk.ok({ data: brands });
});

export const getById = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const brand = await getBrandById(req.userId, brandId);
  return AppOk.ok({ data: brand });
});

export const update = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const brand = await updateBrand(req.userId, brandId, req.body as UpdateBrandBody);
  return AppOk.ok({ data: brand, message: "Brand updated" });
});

export const remove = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  await deleteBrand(req.userId, brandId);
  return AppOk.noContent();
});

// ─── BRAND CONTACTS ─────────────────────────────────────────────────────────────

export const createBrandContact = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const contact = await createContact(req.userId, brandId, req.body as CreateContactBody);
  return AppOk.created({ data: contact, message: "Contact added" });
});

export const listBrandContacts = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const contacts = await getContacts(req.userId, brandId);
  return AppOk.ok({ data: contacts });
});

export const updateBrandContact = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const contactId = req.params["contactId"] as string;
  const contact = await updateContact(req.userId, brandId, contactId, req.body as UpdateContactBody);
  return AppOk.ok({ data: contact, message: "Contact updated" });
});

export const removeBrandContact = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");
  const brandId = req.params["brandId"] as string;
  const contactId = req.params["contactId"] as string;
  await deleteContact(req.userId, brandId, contactId);
  return AppOk.noContent();
});
