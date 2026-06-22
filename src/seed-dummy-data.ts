import { prisma } from './shared/index.js';

/**
 * Seeds dummy data for a specific user to test the Payments/Invoice dashboard.
 * Generates: Brands, Deals, Invoices (Past, Present, Future), and Payment Events.
 */
export async function seedDummyData() {
  const userId = "c53c02fc-da66-4f0d-9d85-0568976a2d93"
  if (!userId) {
    throw new Error('userId is required for seeding data');
  }

  console.log('🚀 Starting data generation for User:', userId);

  try {
    // 1. Create Brands
    const brandsData = [
      { name: 'Apple', category: 'TECH' as const, logoUrl: 'https://logo.clearbit.com/apple.com' },
      { name: 'Nike', category: 'FASHION' as const, logoUrl: 'https://logo.clearbit.com/nike.com' },
      { name: 'Coca Cola', category: 'FOOD' as const, logoUrl: 'https://logo.clearbit.com/cocacola.com' },
      { name: 'Tesla', category: 'AUTOMOTIVE' as const, logoUrl: 'https://logo.clearbit.com/tesla.com' },
    ];

    const brands = [];
    for (const b of brandsData) {
      const brand = await prisma.brand.create({
        data: { ...b, userId }
      });
      brands.push(brand);
      console.log(`✅ Created Brand: ${brand.name}`);
    }

    if (brands.length === 0) return;

    // 2. Create Deals & Invoices
    const now = new Date();
    const oneMonthAgo = new Date(); oneMonthAgo.setMonth(now.getMonth() - 1);
    const twoMonthsAgo = new Date(); twoMonthsAgo.setMonth(now.getMonth() - 2);
    const nextMonth = new Date(); nextMonth.setMonth(now.getMonth() + 1);

    const dealsData = [
      {
        title: 'iPhone 16 Social Campaign',
        brandId: brands[0]!.id,
        amount: 500000,
        currency: 'INR' as const,
        stage: 'COMPLETED' as const,
        invoices: [
          { status: 'PAID' as const, amount: 500000, issued: twoMonthsAgo, due: oneMonthAgo, paid: oneMonthAgo }
        ]
      },
      {
        title: 'Air Max Launch 2026',
        brandId: brands[1]!.id,
        amount: 250000,
        currency: 'INR' as const,
        stage: 'IN_PROGRESS' as const,
        invoices: [
          { status: 'OVERDUE' as const, amount: 250000, issued: oneMonthAgo, due: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 days overdue
        ]
      },
      {
        title: 'Summer Refresher Ads',
        brandId: brands[2]!.id,
        amount: 150000,
        currency: 'INR' as const,
        stage: 'IN_PROGRESS' as const,
        invoices: [
          { status: 'SENT' as const, amount: 150000, issued: now, due: nextMonth } // Future pending
        ]
      },
      {
        title: 'Model 3 Performance Review',
        brandId: brands[3]!.id,
        amount: 75000,
        currency: 'USD' as const,
        stage: 'NEGOTIATION' as const,
        invoices: [
          { status: 'DRAFT' as const, amount: 75000, issued: now, due: nextMonth }
        ]
      }
    ];

    for (const d of dealsData) {
      const { invoices, ...dealFields } = d;
      const deal = await prisma.deal.create({
        data: { ...dealFields, userId }
      });
      console.log(`✅ Created Deal: ${deal.title}`);

      for (const inv of invoices) {
        const invoice = await prisma.invoice.create({
          data: {
            userId: userId,
            dealId: deal.id,
            invoiceNumber: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
            status: inv.status,
            subtotal: inv.amount,
            total: inv.amount,
            issuedDate: inv.issued,
            dueDate: inv.due,
            paidAt: 'paid' in inv ? (inv as any).paid : null,
            lineItems: {
              create: [{ description: deal.title, quantity: 1, unitPrice: inv.amount, amount: inv.amount }]
            }
          }
        });
        console.log(`   📄 Created ${inv.status} Invoice: ${invoice.invoiceNumber}`);

        if (inv.status === 'PAID') {
          await prisma.paymentEvent.create({
            data: {
              dealId: deal.id,
              invoiceId: invoice.id,
              type: 'PAYMENT_RECEIVED',
              amount: inv.amount,
              paidAt: 'paid' in inv ? (inv as any).paid : now,
              method: 'BANK_TRANSFER'
            }
          });
          console.log(`      💰 Created Payment Event for ${invoice.invoiceNumber}`);
        }
      }

      // Add a standalone PaymentEvent (Milestone)
      if (deal.stage === 'COMPLETED') {
        await prisma.paymentEvent.create({
          data: {
            dealId: deal.id,
            type: 'PAYMENT_RECEIVED',
            amount: 50000,
            paidAt: now,
            method: 'CASH'
          }
        });
        console.log(`      💰 Created Bonus Payment Event for ${deal.title}`);
      }
    }

    console.log('\n✨ All dummy data generated successfully!');
    return { success: true };
  } catch (error) {
    console.error('❌ Error generating data:', error);
    throw error;
  }
}
