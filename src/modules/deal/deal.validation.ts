import { z } from "zod";

const dealStageEnum = z.enum([
  "LEAD", "OUTREACH", "NEGOTIATION", "PROPOSAL_SENT", "CONTRACT_SENT",
  "APPROVED", "IN_PROGRESS", "COMPLETED", "LOST", "CANCELLED",
]);

const dealCurrencyEnum = z.enum(["INR", "USD"]);

const paymentTermsEnum = z.enum([
  "ADVANCE_100", "ADVANCE_50", "ON_DELIVERY", "NET_15", "NET_30", "NET_45", "NET_60", "CUSTOM",
]);

const deliverableTypeEnum = z.enum([
  "INSTAGRAM_REEL", "INSTAGRAM_POST", "INSTAGRAM_STORY", "YOUTUBE_SHORT",
  "YOUTUBE_VIDEO", "TIKTOK_VIDEO", "LINKEDIN_POST", "X_POST",
  "BLOG_POST", "NEWSLETTER", "LIVE_STREAM", "UGC_VIDEO", "OTHER",
]);

export const createDealSchema = z.object({
  body: z.object({
    brandId: z.string().uuid("Invalid brand ID"),
    contactId: z.string().uuid("Invalid contact ID").nullable().optional(),
    title: z.string().min(1, "Title is required").max(200),
    stage: dealStageEnum.optional().default("LEAD"),
    amount: z.number().min(0).nullable().optional(),
    currency: dealCurrencyEnum.optional().default("INR"),
    paymentTerms: paymentTermsEnum.nullable().optional(),
    paymentDueDate: z.string().nullable().optional(), // ISO date string
    platforms: z.array(z.string()).optional().default([]),
    contractUrl: z.string().url().nullable().optional(),
    exclusivityEnds: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    deliverables: z.array(z.object({
      type: deliverableTypeEnum,
      quantity: z.number().int().min(1).optional().default(1),
      platform: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })).optional().default([]),
  }),
});

export const updateDealSchema = z.object({
  body: z.object({
    contactId: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    stage: dealStageEnum.optional(),
    amount: z.number().min(0).nullable().optional(),
    currency: dealCurrencyEnum.optional(),
    paymentTerms: paymentTermsEnum.nullable().optional(),
    paymentDueDate: z.string().nullable().optional(),
    platforms: z.array(z.string()).optional(),
    contractUrl: z.string().url().nullable().optional(),
    exclusivityEnds: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export type CreateDealBody = z.infer<typeof createDealSchema>["body"];
export type UpdateDealBody = z.infer<typeof updateDealSchema>["body"];
