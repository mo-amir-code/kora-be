import { z } from "zod";

const brandCategoryEnum = z.enum([
  "TECH", "FASHION", "BEAUTY", "FINANCE", "EDUCATION", "GAMING",
  "FOOD", "FITNESS", "TRAVEL", "AUTOMOTIVE", "HEALTH", "ENTERTAINMENT",
  "E_COMMERCE", "SAAS", "OTHER",
]);

// ─── BRAND SCHEMAS ──────────────────────────────────────────────────────────────

export const createBrandSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Brand name is required").max(200),
    category: brandCategoryEnum,
    logoUrl: z.string().url().nullable().optional(),
    website: z.string().url("Invalid website URL").nullable().optional(),
    gstin: z.string().max(20).nullable().optional(),
    notes: z.array(z.string()).optional().default([]),
  }),
});

export const updateBrandSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    category: brandCategoryEnum.optional(),
    logoUrl: z.string().url().nullable().optional(),
    website: z.string().url("Invalid website URL").nullable().optional(),
    gstin: z.string().max(20).nullable().optional(),
    notes: z.array(z.string()).optional(),
  }),
});

// ─── BRAND CONTACT SCHEMAS ──────────────────────────────────────────────────────

export const createContactSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Contact name is required").max(200),
    role: z.string().max(100).nullable().optional(),
    email: z.string().email("Invalid email").nullable().optional(),
    whatsapp: z.string().max(20).nullable().optional(),
    isPrimary: z.boolean().optional().default(false),
  }),
});

export const updateContactSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    role: z.string().max(100).nullable().optional(),
    email: z.string().email("Invalid email").nullable().optional(),
    whatsapp: z.string().max(20).nullable().optional(),
    isPrimary: z.boolean().optional(),
  }),
});

// ─── TYPES ──────────────────────────────────────────────────────────────────────

export type CreateBrandBody = z.infer<typeof createBrandSchema>["body"];
export type UpdateBrandBody = z.infer<typeof updateBrandSchema>["body"];
export type CreateContactBody = z.infer<typeof createContactSchema>["body"];
export type UpdateContactBody = z.infer<typeof updateContactSchema>["body"];
