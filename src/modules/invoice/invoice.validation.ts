import { z } from 'zod';
import { InvoiceStatus } from '../../generated/client/enums.js';
export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
});

export const createInvoiceSchema = z.object({
  body: z.object({
    dealId: z.string().uuid('Invalid deal ID'),
    invoiceNumber: z.string().min(1).optional(),
    status: z.nativeEnum(InvoiceStatus).optional().default(InvoiceStatus.DRAFT),
    subtotal: z.number().min(0),
    gstRate: z.number().min(0).max(100).optional(),
    gstAmount: z.number().min(0).optional(),
    total: z.number().min(0),
    issuedDate: z.string().transform((val) => new Date(val)),
    dueDate: z.string().transform((val) => new Date(val)),
    notes: z.string().optional(),
    lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
  }),
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    invoiceNumber: z.string().min(1).optional(),
    status: z.nativeEnum(InvoiceStatus).optional(),
    subtotal: z.number().min(0).optional(),
    gstRate: z.number().min(0).max(100).optional(),
    gstAmount: z.number().min(0).optional(),
    total: z.number().min(0).optional(),
    issuedDate: z.string().transform((val) => new Date(val)).optional(),
    dueDate: z.string().transform((val) => new Date(val)).optional(),
    notes: z.string().optional(),
    lineItems: z.array(invoiceLineItemSchema.extend({ id: z.string().uuid().optional() })).optional(),
  }),
});
