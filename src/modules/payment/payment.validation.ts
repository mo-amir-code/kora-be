import { z } from "zod";

export const paymentFilterSchema = z.object({
  query: z.object({
    status: z.enum(["PAID", "PENDING", "OVERDUE", "all"]).optional().default("all"),
  }),
});

export type PaymentFilterQuery = z.infer<typeof paymentFilterSchema>["query"];
