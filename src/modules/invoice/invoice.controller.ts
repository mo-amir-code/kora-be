import { apiController, AppOk, AppError } from '../../shared/index.js';
import { InvoiceService } from './invoice.service.js';
import { InvoiceStatus } from '../../generated/client/enums.js';

const invoiceService = new InvoiceService();

export interface CreateInvoiceDto {
  dealId: string;
  invoiceNumber?: string;
  status: InvoiceStatus;
  subtotal: number;
  gstRate?: number;
  gstAmount?: number;
  total: number;
  issuedDate: Date;
  dueDate: Date;
  notes?: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
}

export interface UpdateInvoiceDto {
  invoiceNumber?: string;
  status?: InvoiceStatus;
  subtotal?: number;
  gstRate?: number;
  gstAmount?: number;
  total?: number;
  issuedDate?: Date;
  dueDate?: Date;
  notes?: string;
  lineItems?: {
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
}

export const createInvoice = apiController(async (req) => {
  const userId = req.userId;
  if (!userId) throw AppError.unauthorized('Not authenticated');

  const invoice = await invoiceService.createInvoice(userId, req.body as CreateInvoiceDto);
  return AppOk.created({ data: invoice, message: 'Invoice created successfully' });
});

export const updateInvoice = apiController(async (req) => {
  const userId = req.userId;
  if (!userId) throw AppError.unauthorized('Not authenticated');

  const { id } = req.params;
  const invoice = await invoiceService.updateInvoice(userId, id as string, req.body as UpdateInvoiceDto);
  return AppOk.ok({ data: invoice, message: 'Invoice updated successfully' });
});

export const getInvoices = apiController(async (req) => {
  const userId = req.userId;
  if (!userId) throw AppError.unauthorized('Not authenticated');

  const invoices = await invoiceService.getInvoices(userId);
  return AppOk.ok({ data: invoices });
});

export const getInvoiceById = apiController(async (req) => {
  const userId = req.userId;
  if (!userId) throw AppError.unauthorized('Not authenticated');

  const { id } = req.params;
  const invoice = await invoiceService.getInvoiceById(userId, id as string);
  
  if (!invoice) throw AppError.notFound('Invoice not found');
  
  return AppOk.ok({ data: invoice });
});

export const deleteInvoice = apiController(async (req) => {
  const userId = req.userId;
  if (!userId) throw AppError.unauthorized('Not authenticated');

  const { id } = req.params;
  await invoiceService.deleteInvoice(userId, id as string);
  return AppOk.ok({ message: 'Invoice deleted successfully' });
});
