import { prisma } from "../../shared/index.js";

export const calendarService = {
  /**
   * Get all calendar events for a user within a date range.
   * @param userId - The authenticated user's ID.
   * @param startDate - Start of the range (inclusive).
   * @param endDate - End of the range (inclusive).
   */
  async getEvents(userId: string, startDate: Date, endDate: Date) {
    const [deliverables, deals, invoices] = await Promise.all([
      // 1. Deliverables — filter by dueDate within range
      prisma.deliverable.findMany({
        where: {
          deal: { userId },
          dueDate: { gte: startDate, lte: endDate },
        },
        include: {
          deal: { include: { brand: true } },
        },
      }),

      // 2. Deals — match if EITHER paymentDueDate OR exclusivityEnds falls in range
      prisma.deal.findMany({
        where: {
          userId,
          OR: [
            { paymentDueDate: { gte: startDate, lte: endDate } },
            { exclusivityEnds: { gte: startDate, lte: endDate } },
          ],
        },
        include: { brand: true },
      }),

      // 3. Invoices — filter by dueDate within range
      prisma.invoice.findMany({
        where: {
          userId,
          dueDate: { gte: startDate, lte: endDate },
        },
        include: {
          deal: { include: { brand: true } },
        },
      }),
    ]);

    const events: any[] = [];

    // Map Deliverables
    deliverables.forEach((d) => {
      events.push({
        id: `deliverable-${d.id}`,
        type: "DELIVERABLE",
        date: d.dueDate,
        title: `${d.deal.brand.name}: ${d.type.replace(/_/g, " ")}`,
        subtitle: d.deal.title,
        status: "brand",
        meta: {
          platform: d.platform,
          quantity: d.quantity,
          dealId: d.dealId,
        },
      });
    });

    // Map Deals (Payment & Exclusivity)
    deals.forEach((deal) => {
      if (deal.paymentDueDate) {
        events.push({
          id: `deal-payment-${deal.id}`,
          type: "PAYMENT_DUE_SOON",
          date: deal.paymentDueDate,
          title: `Payment: ${deal.brand.name}`,
          subtitle: deal.title,
          status: deal.paymentStatus === "OVERDUE" ? "danger" : "success",
          meta: {
            amount: deal.amount,
            currency: deal.currency,
            dealId: deal.id,
          },
        });
      }
      if (deal.exclusivityEnds) {
        events.push({
          id: `deal-exclusivity-${deal.id}`,
          type: "EXCLUSIVITY_END",
          date: deal.exclusivityEnds,
          title: `Exclusivity End: ${deal.brand.name}`,
          subtitle: deal.title,
          status: "warning",
          meta: {
            dealId: deal.id,
          },
        });
      }
    });

    // Map Invoices
    invoices.forEach((inv) => {
      events.push({
        id: `invoice-due-${inv.id}`,
        type: "INVOICE_DUE",
        date: inv.dueDate,
        title: `Invoice #${inv.invoiceNumber} Due`,
        subtitle: inv.deal.brand.name,
        status: inv.status === "OVERDUE" ? "danger" : "warning",
        meta: {
          amount: inv.total,
          brandName: inv.deal.brand.name,
          invoiceId: inv.id,
        },
      });
    });

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },
};
