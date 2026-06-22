import { z } from "zod";
import { MessageTemplateCategory } from "@prisma/client";

const categoryEnum = z.nativeEnum(MessageTemplateCategory);

export const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    body: z.string().min(1, "Template body is required"),
    category: categoryEnum,
    channels: z.array(z.string()).default([]),
  }),
});

export const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    category: categoryEnum.optional(),
    channels: z.array(z.string()).optional(),
  }),
});

export const listTemplatesSchema = z.object({
  query: z.object({
    category: categoryEnum.optional(),
  }),
});
