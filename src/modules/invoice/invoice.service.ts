import { prisma } from '../../shared/database/prisma.js';
import type { CreateInvoiceDto, UpdateInvoiceDto } from './invoice.controller.js';
import { InvoiceStatus } from '../../generated/client/enums.js';
import type { Prisma } from '../../generated/client/client.js';

export class InvoiceService {
  async createInvoice(userId: string, data: CreateInvoiceDto) {
    const { lineItems, ...invoiceData } = data;

    if (!invoiceData.invoiceNumber) {
      const year = new Date().getFullYear();
      const random = Math.floor(1000 + Math.random() * 9000);
      invoiceData.invoiceNumber = `INV-${year}-${random}`;
    }

    return prisma.invoice.create({
      data: {
        ...invoiceData as any,
        invoiceNumber: invoiceData.invoiceNumber!,
        userId,
        lineItems: {
          create: lineItems.map((item: any) => ({
            ...item,
          })),
        },
      },
      include: {
        lineItems: true,
        deal: {
          include: {
            brand: { include: { contacts: true } },
            contact: true,
          },
        },
      },
    });
  }

  async updateInvoice(userId: string, id: string, data: UpdateInvoiceDto) {
    const { lineItems, ...invoiceData } = data;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // If lineItems are provided, handle synchronization
      if (lineItems) {
        // Simple approach: delete existing line items and recreate them
        // More complex approach: update existing ones, delete removed ones
        await tx.invoiceLineItem.deleteMany({
          where: { invoiceId: id },
        });

        await tx.invoiceLineItem.createMany({
          data: lineItems.map((item: any) => ({
            ...item,
            invoiceId: id,
          })),
        });
      }

      if (invoiceData.status === "PAID" && !(invoiceData as any).paidAt) {
        (invoiceData as any).paidAt = new Date();
      }

      return tx.invoice.update({
        where: { id, userId },
        data: invoiceData,
        include: {
          lineItems: true,
          deal: {
            include: {
              brand: { include: { contacts: true } },
              contact: true,
            },
          },
        },
      });
    });
  }

  async getInvoices(userId: string) {
    return prisma.invoice.findMany({
      where: { userId },
      include: {
        deal: {
          include: {
            brand: { include: { contacts: true } },
            contact: true,
          },
        },
        lineItems: true,
      },
      orderBy: {
        issuedDate: 'desc',
      },
    });
  }

  async getInvoiceById(userId: string, id: string) {
    return prisma.invoice.findUnique({
      where: { id, userId },
      include: {
        lineItems: true,
        deal: {
          include: {
            brand: { include: { contacts: true } },
            contact: true,
          },
        },
      },
    });
  }

  async deleteInvoice(userId: string, id: string) {
    return prisma.invoice.delete({
      where: { id, userId },
    });
  }
}
