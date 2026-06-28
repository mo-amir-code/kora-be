import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";
import type { PaymentFilterQuery } from "./payment.validation.js";

export interface PaymentItem {
  id: string;
  type: "DEAL" | "PAYMENT_EVENT";
  brandName: string;
  brandLogo: string | null;
  dealTitle: string;
  amount: number;
  remaining: number;
  currency: string;
  dueDate: Date | null;
  status: "PAID" | "PENDING" | "OVERDUE";
  referenceId: string; // The original ID (Deal or Event)
  sourceId: string;    // The ID for navigation (Deal ID)
}

export async function getPayments(userId: string, filters: PaymentFilterQuery) {
  const now = new Date();

  // 1. Get Deals
  const deals = await prisma.deal.findMany({
    where: {
      userId,
      archivedAt: null,
    },
    include: {
      brand: { select: { name: true, logoUrl: true } },
    },
  });

  // 2. Get PaymentEvents
  const paymentEvents = await prisma.paymentEvent.findMany({
    where: {
      deal: { userId },
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
    ...deals.map((deal) => {
      const amount = Number(deal.amount ?? 0);
      const paid = Number(deal.amountPaid ?? 0);
      const remaining = Math.max(0, amount - paid);
      const isPaid = amount > 0 && paid >= amount;
      const isOverdue = !isPaid && Boolean(deal.paymentDueDate && deal.paymentDueDate < now);
      const status: "PAID" | "PENDING" | "OVERDUE" = isPaid ? "PAID" : isOverdue ? "OVERDUE" : "PENDING";
      return {
        id: deal.id,
        type: "DEAL" as const,
        brandName: deal.brand.name,
        brandLogo: deal.brand.logoUrl,
        dealTitle: deal.title,
        amount,
        remaining,
        currency: deal.currency,
        dueDate: deal.paymentDueDate,
        status,
        referenceId: deal.id,
        sourceId: deal.id,
      };
    }),
    ...paymentEvents.map((evt) => ({
      id: evt.id,
      type: "PAYMENT_EVENT" as const,
      brandName: evt.deal.brand.name,
      brandLogo: evt.deal.brand.logoUrl,
      dealTitle: evt.deal.title,
      amount: Number(evt.amount),
      remaining: 0,
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

  const deals = await prisma.deal.findMany({
    where: { userId, archivedAt: null },
    include: { paymentEvents: true },
  });

  let received = 0;
  let pending = 0;
  let overdue = 0;
  let totalDealsAmount = 0;

  let expectedNext30Amount = 0;
  let expectedNext30Count = 0;
  let overdueCount = 0;
  let totalCollectionDays = 0;
  let paidDealCount = 0;

  deals.forEach((deal) => {
    const dealAmount = Number(deal.amount ?? 0);
    const dealPaid = Number(deal.amountPaid ?? 0);
    const remaining = Math.max(0, dealAmount - dealPaid);

    totalDealsAmount += dealAmount;
    received += dealPaid;

    const isPaid = dealAmount > 0 && dealPaid >= dealAmount;
    const isOverdue = !isPaid && Boolean(deal.paymentDueDate && deal.paymentDueDate < now);

    if (isPaid) {
      paidDealCount++;
      const lastPayment = deal.paymentEvents[0]?.paidAt ?? deal.createdAt;
      const diffMs = lastPayment.getTime() - deal.createdAt.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      totalCollectionDays += diffDays;
    } else if (isOverdue) {
      overdue += remaining;
      overdueCount++;
    } else {
      pending += remaining;
    }

    if (!isPaid && deal.paymentDueDate && deal.paymentDueDate >= now && deal.paymentDueDate <= thirtyDaysLater) {
      expectedNext30Amount += remaining;
      expectedNext30Count++;
    }
  });

  const avgCollectionDays = paidDealCount > 0 ? Math.round(totalCollectionDays / paidDealCount) : 14;
  const collectionRatePercentage = totalDealsAmount > 0 ? Math.min(100, Math.round((received / totalDealsAmount) * 100)) : 100;

  return {
    received,
    pending,
    overdue,
    total: received + pending + overdue,

    expectedNext30Days: {
      amount: expectedNext30Amount,
      invoiceCount: expectedNext30Count, // map for backward compatibility
      dealCount: expectedNext30Count,
    },
    avgCollectionDays: {
      days: avgCollectionDays,
    },
    actionRequired: {
      overdueAmount: overdue,
      overdueCount,
    },
    collectionRate: {
      percentage: collectionRatePercentage,
      collectedAmount: received,
      totalBilledAmount: totalDealsAmount,
    },
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
