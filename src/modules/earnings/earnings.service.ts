import { prisma } from "../../shared/index.js";
import type { EarningsQuery } from "./earnings.validation.js";
import { convertCurrency, getUsdToInrRate } from "./earnings-currency.util.js";

const ACTIVE_INVOICE_STATUSES = ["SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
const POSITIVE_PAYMENT_TYPES = new Set(["PAYMENT_RECEIVED", "PARTIAL_PAYMENT", "ADJUSTMENT"]);
const UNPAID_INVOICE_STATUSES = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] as const;

function monthRange(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { year, monthIndex, start, end };
}

function netPayment(events: Array<{ type: string; amount: unknown }>) {
  return events.reduce((total, event) => {
    const amount = Number(event.amount);
    return total + (POSITIVE_PAYMENT_TYPES.has(event.type) ? amount : -amount);
  }, 0);
}

function outstandingBalance(total: unknown, events: Array<{ type: string; amount: unknown }>) {
  return Math.max(0, Number(total) - netPayment(events));
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function platformFromDeliverable(type: string) {
  const platformByPrefix: Record<string, string> = {
    INSTAGRAM: "Instagram",
    YOUTUBE: "YouTube",
    TIKTOK: "TikTok",
    LINKEDIN: "LinkedIn",
    X: "X",
    BLOG: "Blog",
    NEWSLETTER: "Newsletter",
    LIVE: "Live Stream",
    UGC: "UGC",
  };
  return platformByPrefix[type.split("_")[0] ?? ""] ?? "Other";
}

export async function getEarningsDashboard(userId: string, query: EarningsQuery) {
  const exchangeRate = await getUsdToInrRate();
  const { year, monthIndex, start, end } = monthRange(query.month);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const previousYearStart = new Date(Date.UTC(year - 1, 0, 1));
  const previousYearEnd = new Date(Date.UTC(year - 1, monthIndex + 1, 1));
  const comparisonStart = new Date(Date.UTC(year, monthIndex - 1, 1));

  const [tableDeals, invoices, paymentEvents] = await Promise.all([
    prisma.deal.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [
          { createdAt: { gte: start, lt: end } },
          { paymentEvents: { some: { paidAt: { gte: start, lt: end } } } },
          { invoices: { some: { dueDate: { gte: start, lt: end } } } },
          {
            invoices: {
              some: {
                dueDate: { lt: today },
                status: { in: [...UNPAID_INVOICE_STATUSES] },
              },
            },
          },
        ],
      },
      include: {
        brand: { select: { name: true, logoUrl: true } },
        deliverables: { select: { platform: true, type: true } },
        invoices: { include: { paymentEvents: true } },
        paymentEvents: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: {
        userId,
        issuedDate: { lt: end },
        status: { in: [...ACTIVE_INVOICE_STATUSES] },
      },
      include: { paymentEvents: true, deal: { select: { currency: true } } },
    }),
    prisma.paymentEvent.findMany({
      where: {
        paidAt: { gte: previousYearStart, lt: end },
        deal: { userId },
      },
      select: {
        type: true,
        amount: true,
        paidAt: true,
        invoiceId: true,
        deal: { select: { currency: true } },
      },
    }),
  ]);

  // Older records may have been marked PAID before payment events were introduced.
  // Use the invoice total only when no linked event exists, so revenue is never counted twice.
  const invoiceFallbackPayments = invoices.flatMap((invoice) => {
    if (invoice.status !== "PAID" || invoice.paymentEvents.length > 0) return [];
    return [{
      type: "PAYMENT_RECEIVED",
      amount: invoice.total,
      paidAt: invoice.paidAt ?? invoice.issuedDate,
      invoiceId: invoice.id,
      deal: { currency: invoice.deal.currency },
    }];
  });
  const ledger = [...paymentEvents, ...invoiceFallbackPayments];

  const earnedForRange = (rangeStart: Date, rangeEnd: Date) => ledger
    .filter((event) => event.paidAt >= rangeStart && event.paidAt < rangeEnd)
    .reduce((total, event) => {
      const signedAmount = POSITIVE_PAYMENT_TYPES.has(event.type) ? Number(event.amount) : -Number(event.amount);
      return total + convertCurrency(signedAmount, event.deal.currency, query.currency, exchangeRate.usdToInr);
    }, 0);

  const earned = earnedForRange(start, end);
  const previousMonthEarned = earnedForRange(comparisonStart, start);

  const selectedInvoices = invoices.filter((invoice) => invoice.dueDate >= start && invoice.dueDate < end);
  let pending = 0;
  let overdue = 0;
  let pendingInvoiceCount = 0;

  for (const invoice of selectedInvoices) {
    if (invoice.status === "PAID") continue;
    const eventsBeforeEnd = invoice.paymentEvents.filter((event) => event.paidAt < end);
    const outstanding = outstandingBalance(invoice.total, eventsBeforeEnd);
    if (outstanding === 0) continue;

    const convertedOutstanding = convertCurrency(outstanding, invoice.deal.currency, query.currency, exchangeRate.usdToInr);
    if (invoice.dueDate < today) overdue += convertedOutstanding;
    else {
      pending += convertedOutstanding;
      pendingInvoiceCount += 1;
    }
  }

  const visibleDeals = tableDeals.filter((deal) => {
    switch (query.filter) {
      case "expected":
        return deal.invoices.some((invoice) => invoice.dueDate >= start && invoice.dueDate < end);
      case "paid":
        return deal.paymentEvents.some((event) => event.paidAt >= start && event.paidAt < end);
      case "created":
        return deal.createdAt >= start && deal.createdAt < end;
      case "overdue":
        return deal.invoices.some((invoice) => (
          UNPAID_INVOICE_STATUSES.includes(invoice.status as typeof UNPAID_INVOICE_STATUSES[number])
          && invoice.dueDate < today
          && outstandingBalance(invoice.total, invoice.paymentEvents.filter((event) => event.paidAt < today)) > 0
        ));
      case "all":
      default:
        return true;
    }
  });

  const dealValues = visibleDeals.flatMap((deal) => deal.amount === null
    ? []
    : [convertCurrency(Number(deal.amount), deal.currency, query.currency, exchangeRate.usdToInr)],
  );
  const averageDealValue = dealValues.length
    ? dealValues.reduce((sum, amount) => sum + amount, 0) / dealValues.length
    : 0;

  const breakdownValues = { paid: earned, pending, overdue };
  const breakdownTotal = Object.values(breakdownValues).reduce((sum, value) => sum + value, 0);
  const breakdown = Object.entries(breakdownValues).map(([status, amount]) => ({
    status: status.toUpperCase(),
    amount,
    percentage: breakdownTotal ? Math.round((amount / breakdownTotal) * 1000) / 10 : 0,
  }));

  const trend = Array.from({ length: 6 }, (_, index) => {
    const itemStart = new Date(Date.UTC(year, monthIndex - index, 1));
    const itemEnd = new Date(Date.UTC(year, monthIndex - index + 1, 1));
    const itemPending = invoices
      .filter((invoice) => invoice.status !== "PAID" && invoice.dueDate >= itemStart && invoice.dueDate < itemEnd)
      .reduce((sum, invoice) => {
        const paidByMonthEnd = netPayment(invoice.paymentEvents.filter((event) => event.paidAt < itemEnd));
        const outstanding = outstandingBalance(invoice.total, [{ type: "PAYMENT_RECEIVED", amount: paidByMonthEnd }]);
        return sum + convertCurrency(outstanding, invoice.deal.currency, query.currency, exchangeRate.usdToInr);
      }, 0);

    return {
      month: itemStart.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      monthKey: itemStart.toISOString().slice(0, 7),
      paid: earnedForRange(itemStart, itemEnd),
      pending: itemPending,
    };
  });

  const yearToDate = earnedForRange(yearStart, end);
  const previousYearToDate = earnedForRange(previousYearStart, previousYearEnd);

  const recentDeals = visibleDeals.map((deal) => {
    const paid = netPayment(deal.paymentEvents.filter((event) => event.paidAt < end));
    const amount = Number(deal.amount ?? 0);
    const overdueInvoice = deal.invoices.find((invoice) => (
      UNPAID_INVOICE_STATUSES.includes(invoice.status as typeof UNPAID_INVOICE_STATUSES[number])
      && invoice.dueDate < today
      && outstandingBalance(invoice.total, invoice.paymentEvents.filter((event) => event.paidAt < today)) > 0
    ));
    const status = amount > 0 && paid >= amount
      ? "PAID"
      : overdueInvoice
        ? "OVERDUE"
        : deal.stage === "COMPLETED"
          ? "DELIVERED"
          : "PENDING";
    const paidEvent = deal.paymentEvents.find((event) => POSITIVE_PAYMENT_TYPES.has(event.type));
    const platforms = [...new Set([
      ...deal.platforms,
      ...deal.deliverables.map((deliverable) => deliverable.platform ?? platformFromDeliverable(deliverable.type)),
    ].filter((platform) => platform.trim().length > 0))];

    return {
      id: deal.id,
      brandName: deal.brand.name,
      brandLogo: deal.brand.logoUrl,
      dealTitle: deal.title,
      value: amount,
      currency: deal.currency,
      platforms,
      status,
      paidDate: paidEvent?.paidAt ?? null,
    };
  });

  return {
    period: query.month,
    currency: query.currency,
    filter: query.filter,
    exchangeRate: exchangeRate.usdToInr,
    exchangeRateSource: exchangeRate.source,
    metrics: {
      earned,
      earnedChangePercentage: percentChange(earned, previousMonthEarned),
      pending,
      pendingInvoiceCount,
      overdue,
      averageDealValue,
      dealCount: dealValues.length,
    },
    breakdown: { total: breakdownTotal, items: breakdown },
    trend,
    recentDeals,
    yearly: {
      year,
      yearToDate,
      previousYearToDate,
      changePercentage: percentChange(yearToDate, previousYearToDate),
    },
  };
}
