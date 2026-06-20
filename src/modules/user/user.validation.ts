import { z } from "zod";

export const updateMeSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, "Full name must be at least 2 characters").optional(),
    handle: z.string().min(2, "Handle must be at least 2 characters").regex(/^[a-zA-Z0-9_]+$/, "Handle can only contain letters, numbers, and underscores").optional(),
    whatsappNumber: z.string().min(10, "Invalid WhatsApp number").optional(),
    avatarUrl: z.string().url("Invalid avatar URL").optional().nullable(),
  }),
});
