import { prisma } from "../../shared/index.js";

export class DashboardService {
  /**
   * Fetches dashboard home data including grouped rolling 7-day deadlines,
   * earnings stats, active deals, and recent activities.
   */
  async getDashboardHome(userId: string) {
    const now = new Date();
    
    // 1. Fetch User Info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true }
    });

    // 2. Rolling Deadlines (Next 7 Days)
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfSevenDays = new Date(sevenDaysFromNow);
    endOfSevenDays.setHours(23, 59, 59, 999);

    const deliverables = await prisma.deliverable.findMany({
      where: {
        deal: { userId },
        isCompleted: false,
        dueDate: {
          gte: startOfToday,
          lte: endOfSevenDays,
        },
      },
      include: {
        deal: {
          include: {
            brand: true,
          },
        },
      },
      orderBy: {
        dueDate: "asc",
      },
    });

    const groupedDeadlinesMap: Record<string, any> = {};
    deliverables.forEach((del) => {
      if (!del.dueDate) return;
      const dateKey = del.dueDate.toISOString().split("T")[0]; 
      if (!dateKey) return;
      const brandId = del.deal.brand.id;
      const groupKey = `${brandId}_${dateKey}`;

      if (!groupedDeadlinesMap[groupKey]) {
        groupedDeadlinesMap[groupKey] = {
          brand: del.deal.brand,
          dueDate: del.dueDate,
          items: [],
        };
      }
      groupedDeadlinesMap[groupKey].items.push({
        id: del.id,
        type: del.type,
        dealTitle: del.deal.title,
        dealId: del.deal.id,
      });
    });

    const deadlines = Object.values(groupedDeadlinesMap).sort(
      (a: any, b: any) => a.dueDate.getTime() - b.dueDate.getTime()
    );

    // 3. Earnings Statistics
    const allInvoices = await prisma.invoice.findMany({
      where: { userId },
      select: { status: true, total: true }
    });

    const stats = {
      totalEarned: allInvoices
        .filter(inv => inv.status === 'PAID')
        .reduce((sum, inv) => sum + Number(inv.total), 0),
      pendingPayments: allInvoices
        .filter(inv => ['SENT', 'VIEWED', 'PARTIALLY_PAID'].includes(inv.status))
        .reduce((sum, inv) => sum + Number(inv.total), 0),
      overdue: allInvoices
        .filter(inv => inv.status === 'OVERDUE')
        .reduce((sum, inv) => sum + Number(inv.total), 0)
    };

    // 4. Active Deals (Top 5)
    const activeDeals = await prisma.deal.findMany({
      where: {
        userId,
        stage: {
          notIn: ['COMPLETED', 'LOST', 'CANCELLED']
        }
      },
      include: {
        brand: true,
        deliverables: {
          select: { isCompleted: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formattedActiveDeals = activeDeals.map(deal => {
      const completed = deal.deliverables.filter(d => d.isCompleted).length;
      const total = deal.deliverables.length;
      return {
        id: deal.id,
        dealName: deal.title,
        brandName: deal.brand.name,
        logoUrl: deal.brand.logoUrl,
        amount: Number(deal.amount || 0),
        currency: deal.currency,
        progress: `${completed}/${total}`,
        stage: deal.stage
      };
    });

    // 5. Recent Activity (Last 10)
    const activities = await prisma.dealActivity.findMany({
      where: { userId },
      include: { deal: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    return {
      user: { name: user?.fullName.split(' ')[0] || "User" },
      deadlines,
      stats,
      activeDeals: formattedActiveDeals,
      activities
    };
  }
}

export const dashboardService = new DashboardService();
