import { prisma } from "../../shared/index.js";
import type { EarningsQuery } from "./earnings.validation.js";

const ACTIVE_INVOICE_STATUSES = ["SENT", "VIEWED", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
const POSITIVE_PAYMENT_TYPES = new Set(["PAYMENT_RECEIVED", "PARTIAL_PAYMENT", "ADJUSTMENT"]);
const UNPAID_INVOICE_STATUSES = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] as const;

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    let hour = getPart("hour");
    if (hour === 24) hour = 0;
    const targetUtc = Date.UTC(getPart("year"), getPart("month") - 1, getPart("day"), hour, getPart("minute"), getPart("second"));
    return targetUtc - date.getTime();
  } catch {
    return 0;
  }
}

function getZonedDateTime(year: number, monthIndex: number, day: number, hour = 0, minute = 0, second = 0, timezone = "UTC"): Date {
  const utcApprox = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
  const offset = getTimezoneOffsetMs(utcApprox, timezone);
  return new Date(utcApprox.getTime() - offset);
}

function monthRange(month: string, timezone: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = getZonedDateTime(year, monthIndex, 1, 0, 0, 0, timezone);
  const end = getZonedDateTime(year, monthIndex + 1, 1, 0, 0, 0, timezone);
  return { year, monthIndex, start, end };
}

function getTodayInTimezone(timezone: string): Date {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    return getZonedDateTime(getPart("year"), getPart("month") - 1, getPart("day"), 0, 0, 0, timezone);
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
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
  const userSettings = await prisma.userSettings.findUnique({ where: { userId } });
  const timezone = userSettings?.timezone || "UTC";

  const { year, monthIndex, start, end } = monthRange(query.month, timezone);
  const today = getTodayInTimezone(timezone);
  const yearStart = getZonedDateTime(year, 0, 1, 0, 0, 0, timezone);
  const previousYearStart = getZonedDateTime(year - 1, 0, 1, 0, 0, 0, timezone);
  const previousYearEnd = getZonedDateTime(year - 1, monthIndex + 1, 1, 0, 0, 0, timezone);
  const comparisonStart = getZonedDateTime(year, monthIndex - 1, 1, 0, 0, 0, timezone);

  const [tableDeals, invoices, paymentEvents] = await Promise.all([
    prisma.deal.findMany({
      where: {
        userId,
        archivedAt: null,
        OR: [
          { createdAt: { gte: start, lt: end } },
          { paymentDueDate: { gte: start, lt: end } },
          { paymentEvents: { some: { paidAt: { gte: start, lt: end } } } },
          { invoices: { some: { dueDate: { gte: start, lt: end } } } },
          { paymentDueDate: { lt: today } },
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
      return total + signedAmount;
    }, 0);

  const visibleDeals = tableDeals;

  const processedDeals = visibleDeals.map((deal) => {
    const dealAmount = Number(deal.amount ?? 0);
    const paidRaw = Math.max(Number(deal.amountPaid ?? 0), netPayment(deal.paymentEvents.filter((event) => event.paidAt < end)));
    const remainingRaw = Math.max(0, dealAmount - paidRaw);

    const isDealOverdue = deal.paymentDueDate ? (deal.paymentDueDate < today && dealAmount > paidRaw) : false;
    const overdueInvoice = deal.invoices.find((invoice) => (
      UNPAID_INVOICE_STATUSES.includes(invoice.status as typeof UNPAID_INVOICE_STATUSES[number])
      && invoice.dueDate < today
      && outstandingBalance(invoice.total, invoice.paymentEvents.filter((event) => event.paidAt < today)) > 0
    ));
    const status = dealAmount > 0 && paidRaw >= dealAmount
      ? "PAID"
      : isDealOverdue || overdueInvoice || deal.paymentStatus === "OVERDUE"
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
      deal,
      dealAmount,
      remainingRaw,
      paidConverted: paidRaw,
      remainingConverted: remainingRaw,
      dealAmountConverted: dealAmount,
      status,
      paidEvent,
      platforms,
    };
  });

  const earned = processedDeals.reduce((sum, d) => sum + d.paidConverted, 0);
  const previousMonthEarned = earnedForRange(comparisonStart, start);

  const pendingDeals = processedDeals.filter((d) => d.status === "PENDING" || d.status === "DELIVERED");
  const pending = pendingDeals.reduce((sum, d) => sum + d.remainingConverted, 0);
  const pendingInvoiceCount = pendingDeals.length;

  const overdueDeals = processedDeals.filter((d) => d.status === "OVERDUE");
  const overdue = overdueDeals.reduce((sum, d) => sum + d.remainingConverted, 0);

  const averageDealValue = processedDeals.length
    ? processedDeals.reduce((sum, d) => sum + d.dealAmountConverted, 0) / processedDeals.length
    : 0;

  const breakdownValues = { paid: earned, pending, overdue };
  const breakdownTotal = Object.values(breakdownValues).reduce((sum, value) => sum + value, 0);
  const breakdown = Object.entries(breakdownValues).map(([status, amount]) => ({
    status: status.toUpperCase(),
    amount,
    percentage: breakdownTotal ? Math.round((amount / breakdownTotal) * 1000) / 10 : 0,
  }));

  const trend = Array.from({ length: 6 }, (_, index) => {
    const itemStart = getZonedDateTime(year, monthIndex - index, 1, 0, 0, 0, timezone);
    const itemEnd = getZonedDateTime(year, monthIndex - index + 1, 1, 0, 0, 0, timezone);
    const itemPending = invoices
      .filter((invoice) => invoice.status !== "PAID" && invoice.dueDate >= itemStart && invoice.dueDate < itemEnd)
      .reduce((sum, invoice) => {
        const paidByMonthEnd = netPayment(invoice.paymentEvents.filter((event) => event.paidAt < itemEnd));
        const outstanding = outstandingBalance(invoice.total, [{ type: "PAYMENT_RECEIVED", amount: paidByMonthEnd }]);
        return sum + outstanding;
      }, 0);

    return {
      month: itemStart.toLocaleDateString("en-US", { month: "short", timeZone: timezone }),
      monthKey: `${itemStart.getFullYear()}-${String(itemStart.getMonth() + 1).padStart(2, "0")}`,
      paid: earnedForRange(itemStart, itemEnd),
      pending: itemPending,
    };
  });

  const yearToDate = earnedForRange(yearStart, end);
  const previousYearToDate = earnedForRange(previousYearStart, previousYearEnd);

  const recentDeals = processedDeals.map(({ deal, dealAmount, remainingRaw, status, paidEvent, platforms }) => ({
    id: deal.id,
    brandName: deal.brand.name,
    brandLogo: deal.brand.logoUrl,
    dealTitle: deal.title,
    value: dealAmount,
    remaining: remainingRaw,
    currency: deal.currency,
    platforms,
    status,
    paidDate: paidEvent?.paidAt ?? null,
  }));

  return {
    period: query.month,
    currency: "USD",
    filter: query.filter,
    exchangeRate: 1,
    exchangeRateSource: "fixed",
    metrics: {
      earned,
      earnedChangePercentage: percentChange(earned, previousMonthEarned),
      pending,
      pendingInvoiceCount,
      overdue,
      averageDealValue,
      dealCount: processedDeals.length,
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
