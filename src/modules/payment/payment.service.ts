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

  // 2. Get PaymentEvents
  const paymentEvents = await prisma.paymentEvent.findMany({
    where: {
      deal: { userId },
      invoiceId: null,
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
      dueDate: evt.paidAt,
      status: "PAID" as const,
      referenceId: evt.dealId,
      sourceId: evt.dealId,
    })),
  ];

  let filtered = paymentItems;
  if (filters.status !== "all") {
    filtered = paymentItems.filter((item) => item.status === filters.status);
  }

  return filtered.sort((a, b) => (b.dueDate?.getTime() || 0) - (a.dueDate?.getTime() || 0));
}

export async function getPaymentStats(userId: string) {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Legacy calculations (for backwards compatibility)
  const invoiceStats = await prisma.invoice.groupBy({
    by: ["status"],
    where: { userId },
    _sum: { total: true },
  });

  const overdueInvoices = await prisma.invoice.aggregate({
    where: { userId, status: { not: "PAID" }, dueDate: { lt: now } },
    _sum: { total: true },
    _count: { id: true }
  });

  const eventStats = await prisma.paymentEvent.aggregate({
    where: { deal: { userId } },
    _sum: { amount: true },
  });

  const received = (invoiceStats.find(s => s.status === "PAID")?._sum.total?.toNumber() || 0) + 
                   (eventStats._sum.amount?.toNumber() || 0);
  
  const pending = invoiceStats.filter(s => s.status !== "PAID").reduce((acc, s) => acc + (s._sum.total?.toNumber() || 0), 0) - 
                  (overdueInvoices._sum.total?.toNumber() || 0);

  const overdue = overdueInvoices._sum.total?.toNumber() || 0;

  // New Operational Metrics
  // 1. Expected next 30 days
  const expectedNext30 = await prisma.invoice.aggregate({
    where: {
      userId,
      status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] },
      dueDate: { gte: now, lte: thirtyDaysLater }
    },
    _sum: { total: true },
    _count: { id: true }
  });

  // 2. Average collection speed (days from issuedDate to paidAt for paid invoices)
  const paidInvoices = await prisma.invoice.findMany({
    where: { userId, status: "PAID", paidAt: { not: null } },
    select: { issuedDate: true, paidAt: true }
  });

  let totalCollectionDays = 0;
  paidInvoices.forEach(inv => {
    if (inv.paidAt) {
      const diffMs = inv.paidAt.getTime() - inv.issuedDate.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      totalCollectionDays += diffDays;
    }
  });
  const avgCollectionDays = paidInvoices.length > 0 ? Math.round(totalCollectionDays / paidInvoices.length) : 14;

  // 3. Collection Rate
  const totalBilledAgg = await prisma.invoice.aggregate({
    where: { userId, status: { notIn: ["DRAFT", "VOID", "CANCELLED"] } },
    _sum: { total: true }
  });
  const totalBilled = totalBilledAgg._sum.total?.toNumber() || 0;
  const totalPaid = received;
  const collectionRatePercentage = totalBilled > 0 ? Math.min(100, Math.round((totalPaid / totalBilled) * 100)) : 100;

  return {
    received,
    pending,
    overdue,
    total: received + pending + overdue,

    // Rich Operational Metrics
    expectedNext30Days: {
      amount: expectedNext30._sum.total?.toNumber() || 0,
      invoiceCount: expectedNext30._count.id || 0
    },
    avgCollectionDays: {
      days: avgCollectionDays
    },
    actionRequired: {
      overdueAmount: overdue,
      overdueCount: overdueInvoices._count.id || 0
    },
    collectionRate: {
      percentage: collectionRatePercentage,
      collectedAmount: totalPaid,
      totalBilledAmount: totalBilled
    }
  };
}

export async function createPaymentEvent(userId: string, data: {
  dealId: string;
  invoiceId?: string;
  type: "PAYMENT_RECEIVED" | "PARTIAL_PAYMENT" | "REFUND" | "CHARGEBACK" | "ADJUSTMENT";
  amount: number;
  method?: string;
  reference?: string;
  paidAt?: string;
}) {
  // 1. Verify Deal ownership
  const deal = await prisma.deal.findFirst({
    where: { id: data.dealId, userId }
  });
  if (!deal) throw AppError.notFound("Deal not found");

  const paidDate = data.paidAt ? new Date(data.paidAt) : new Date();

  // 2. Create PaymentEvent record
  const paymentEvent = await prisma.paymentEvent.create({
    data: {
      dealId: data.dealId,
      invoiceId: data.invoiceId || null,
      type: data.type as any,
      amount: data.amount,
      method: data.method || null,
      reference: data.reference || null,
      paidAt: paidDate
    }
  });

  // 3. Update Deal amountPaid & paymentStatus
  const currentPaid = Number(deal.amountPaid || 0);
  let newPaid = currentPaid;
  if (data.type === "PAYMENT_RECEIVED" || data.type === "PARTIAL_PAYMENT") {
    newPaid += data.amount;
  } else if (data.type === "REFUND") {
    newPaid = Math.max(0, newPaid - data.amount);
  }

  const dealTotalAmount = Number(deal.amount || 0);
  let newPaymentStatus = deal.paymentStatus;
  if (newPaid >= dealTotalAmount && dealTotalAmount > 0) {
    newPaymentStatus = "PAID";
  } else if (newPaid > 0) {
    newPaymentStatus = "PARTIALLY_PAID";
  }

  await prisma.deal.update({
    where: { id: data.dealId },
    data: {
      amountPaid: newPaid,
      paymentStatus: newPaymentStatus as any
    }
  });

  // 4. Update Invoice if linked
  if (data.invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: data.invoiceId, userId }
    });
    if (invoice) {
      const allEvents = await prisma.paymentEvent.findMany({
        where: { invoiceId: data.invoiceId }
      });
      const invoiceTotalPaid = allEvents.reduce((sum, e) => {
        if (e.type === "PAYMENT_RECEIVED" || e.type === "PARTIAL_PAYMENT") return sum + Number(e.amount);
        if (e.type === "REFUND") return sum - Number(e.amount);
        return sum;
      }, 0);

      let invStatus = invoice.status;
      if (invoiceTotalPaid >= Number(invoice.total)) {
        invStatus = "PAID";
      } else if (invoiceTotalPaid > 0) {
        invStatus = "PARTIALLY_PAID";
      }

      await prisma.invoice.update({
        where: { id: data.invoiceId },
        data: {
          status: invStatus as any,
          paidAt: invStatus === "PAID" ? paidDate : invoice.paidAt
        }
      });
    }
  }

  // 5. Log Activity
  await prisma.dealActivity.create({
    data: {
      dealId: data.dealId,
      userId,
      type: "PAYMENT_RECEIVED",
      body: `Payment of ₹${data.amount.toLocaleString()} recorded (${data.type.replace('_', ' ')})`
    }
  });

  return paymentEvent;
}
