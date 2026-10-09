import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { ReceivablesStore } from './common/application/receivables-store.js';
import { PrismaReceivablesStore } from './common/infrastructure/prisma-receivables.store.js';
import {
  CreditNotesController, CustomerReceiptsController, PosController, ReceivablesOptionsController, RecurringInvoicesController, SalesReturnsController,
} from './common/presentation/receivables-ops.controller.js';
import { CreditNotesService } from './credit-notes/application/credit-notes.service.js';
import { PosService } from './pos/application/pos.service.js';
import { CustomerReceiptsService } from './receipts/application/customer-receipts.service.js';
import { RecurringInvoicesService } from './recurring/application/recurring-invoices.service.js';
import { ArReportsService } from './reports/application/ar-reports.service.js';
import { SalesReturnsService } from './returns/application/sales-returns.service.js';

/**
 * Sales completion (Phase 24): sales returns, credit notes, customer receipts with allocation (cheques through
 * Cheques in hand), recurring invoices (hourly job), POS shifts and sales, AR ageing and customer statements.
 * Builds on Phase 23's invoices through the Sales module's store. Posting runs in the database's Sales functions.
 */
@Module({
  imports: [SalesModule],
  controllers: [ReceivablesOptionsController, SalesReturnsController, CreditNotesController, CustomerReceiptsController, RecurringInvoicesController, PosController],
  providers: [
    { provide: ReceivablesStore, useClass: PrismaReceivablesStore },
    SalesReturnsService, CreditNotesService, CustomerReceiptsService, RecurringInvoicesService, PosService, ArReportsService,
  ],
  /** Phase 26 (route settlements, recovery sheets) records receipts and returns through these. */
  exports: [CustomerReceiptsService, SalesReturnsService, ReceivablesStore],
})
export class ReceivablesOpsModule {}
