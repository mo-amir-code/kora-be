import { z } from "zod";
import { DealCurrency } from "../../generated/client/enums.js";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const earningsFilterEnum = z.enum(["expected", "paid", "created", "overdue", "all"]);

export const earningsQuerySchema = z.object({
  query: z.object({
    month: z.string().regex(monthPattern, "Month must use YYYY-MM format"),
    currency: z.nativeEnum(DealCurrency).optional().default(DealCurrency.USD),
    filter: earningsFilterEnum.optional().default("expected"),
  }),
});

export type EarningsQuery = z.infer<typeof earningsQuerySchema>["query"];
