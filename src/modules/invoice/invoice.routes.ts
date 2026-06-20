import { Router } from 'express';
import { validate, authenticate } from '../../shared/index.js';
import {
  createInvoice,
  updateInvoice,
  getInvoices,
  getInvoiceById,
  deleteInvoice
} from './invoice.controller.js';
import {
  createInvoiceSchema,
  updateInvoiceSchema
} from './invoice.validation.js';

const router = Router();

// All invoice routes require authentication
router.use(authenticate);

router.post('/', validate(createInvoiceSchema), createInvoice);
router.get('/', getInvoices);
router.get('/:id', getInvoiceById);
router.patch('/:id', validate(updateInvoiceSchema), updateInvoice);
router.delete('/:id', deleteInvoice);

export { router as invoiceRoutes };
