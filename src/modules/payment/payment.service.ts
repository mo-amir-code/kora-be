import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";
import type { PaymentFilterQuery } from "./payment.validation.js";

export interface PaymentItem {
  id: string;
  type: "INVOICE" | "PAYMENT_EVENT";
  brandName: string;
  brandLogo: string | null;
  dealTitle: string;
  amount: number;
  currency: string;
  dueDate: Date | null;
  status: "PAID" | "PENDING" | "OVERDUE";
  referenceId: string; // The original ID (Invoice or Event)
  sourceId: string;    // The ID for navigation (Invoice ID or Deal ID)
}

export async function getPayments(userId: string, filters: PaymentFilterQuery) {
  const now = new Date();

  // 1. Get Invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      ...(filters.status === "PAID" && { status: "PAID" }),
      ...(filters.status === "PENDING" && { status: { not: "PAID" }, dueDate: { gte: now } }),
      ...(filters.status === "OVERDUE" && { status: { not: "PAID" }, dueDate: { lt: now } }),
    },
    include: {
      deal: {
        include: {
          brand: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });

  // 2. Get PaymentEvents (Milestones) that are NOT linked to invoices yet OR just general milestones
  // To avoid double counting, we might filter out events already part of an invoice if we prefer
  // But usually milestones are separate.
  const paymentEvents = await prisma.paymentEvent.findMany({
    where: {
      deal: { userId },
      invoiceId: null, // Only show milestones that haven't been invoiced if we want a clean list
      // status handling for events? PaymentEvent model doesn't have a status, usually it's "PAID" if it exists.
      // Actually, PaymentEvent usually represents a record of payment happened.
    },
    include: {
      deal: {
        include: {
          brand: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });

  const paymentItems: PaymentItem[] = [
    ...invoices.map((inv) => ({
      id: inv.id,
      type: "INVOICE" as const,
      brandName: inv.deal.brand.name,
      brandLogo: inv.deal.brand.logoUrl,
      dealTitle: inv.deal.title,
      amount: Number(inv.total),
      currency: inv.deal.currency,
      dueDate: inv.dueDate,
      status: inv.status === "PAID" ? "PAID" : (inv.dueDate < now ? "OVERDUE" : "PENDING") as any,
      referenceId: inv.id,
      sourceId: inv.id,
    })),
    ...paymentEvents.map((evt) => ({
      id: evt.id,
      type: "PAYMENT_EVENT" as const,
      brandName: evt.deal.brand.name,
      brandLogo: evt.deal.brand.logoUrl,
      dealTitle: evt.deal.title,
      amount: Number(evt.amount),
      currency: evt.deal.currency,
      dueDate: evt.paidAt, // For paid events, dueDate is when it was paid
      status: "PAID" as const,
      referenceId: evt.dealId,
      sourceId: evt.dealId,
    })),
  ];

  // Apply filters to combined list if needed (e.g. if PaymentEvents were added they are PAID)
  let filtered = paymentItems;
  if (filters.status !== "all") {
    filtered = paymentItems.filter((item) => item.status === filters.status);
  }

  return filtered.sort((a, b) => (b.dueDate?.getTime() || 0) - (a.dueDate?.getTime() || 0));
}

export async function getPaymentStats(userId: string) {
  const now = new Date();

  // Aggregate Invoices
  const invoiceStats = await prisma.invoice.groupBy({
    by: ["status"],
    where: { userId },
    _sum: { total: true },
  });

  const overdueInvoices = await prisma.invoice.aggregate({
    where: { userId, status: { not: "PAID" }, dueDate: { lt: now } },
    _sum: { total: true },
  });

  // Aggregate PaymentEvents
  const eventStats = await prisma.paymentEvent.aggregate({
    where: { deal: { userId } },
    _sum: { amount: true },
  });

  const received = (invoiceStats.find(s => s.status === "PAID")?._sum.total?.toNumber() || 0) + 
                   (eventStats._sum.amount?.toNumber() || 0);
  
  const pending = invoiceStats.filter(s => s.status !== "PAID").reduce((acc, s) => acc + (s._sum.total?.toNumber() || 0), 0) - 
                  (overdueInvoices._sum.total?.toNumber() || 0);

  const overdue = overdueInvoices._sum.total?.toNumber() || 0;

  return {
    received,
    pending,
    overdue,
    total: received + pending + overdue,
  };
}
