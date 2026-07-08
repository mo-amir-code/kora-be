import { prisma } from "../database/prisma.js";
import { UserPlan } from "../../generated/client/enums.js";
import { AppError } from "../utils/app-error.js";

/**
 * Validates whether the user can create a new deal under their plan's limits.
 * Throws AppError.forbidden if the user is on the FREE plan and has already created 3 or more deals.
 */
export async function checkDealLimit(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (user && user.plan !== UserPlan.PRO) {
    const totalDeals = await prisma.deal.count({
      where: { userId },
    });
    if (totalDeals >= 3) {
      throw AppError.forbidden("Deals limit reached (max 3 for Starter plan). Please upgrade to Pro Creator plan to create more deals.");
    }
  }
}

/**
 * Validates whether the user can apply custom invoice branding under their plan's limits.
 * Throws AppError.forbidden if the user is on the FREE plan and tries to save custom branding.
 */
export async function checkInvoiceBrandingLimit(
  userId: string,
  data: { logoUrl?: string | null; invoicePrefix?: string | null }
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (user && user.plan !== UserPlan.PRO) {
    const isCustomPrefix = data.invoicePrefix && data.invoicePrefix !== "INV-" && data.invoicePrefix.trim() !== "";
    const isCustomLogo = data.logoUrl && data.logoUrl.trim() !== "";
    if (isCustomPrefix || isCustomLogo) {
      throw AppError.forbidden("Custom PDF branding (Logo and Invoice Prefix) is a Pro feature. Please upgrade to Pro Creator plan to use custom branding.");
    }
  }
}
