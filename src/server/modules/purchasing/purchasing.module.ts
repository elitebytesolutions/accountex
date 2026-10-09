import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { VendorBillsService } from './bills/application/vendor-bills.service.js';
import { PurchaseVouchersController, VendorBillsController } from './bills/presentation/vendor-bills.controller.js';
import { PayablesStore } from './common/application/payables-store.js';
import { PurchaseOptionsService } from './common/application/purchase-options.service.js';
import { PurchasingStore } from './common/application/purchasing-store.js';
import { PrismaPayablesStore } from './common/infrastructure/prisma-payables.store.js';
import { PrismaPurchasingStore } from './common/infrastructure/prisma-purchasing.store.js';
import { DebitNotesService } from './debit-notes/application/debit-notes.service.js';
import { DebitNotesController } from './debit-notes/presentation/debit-notes.controller.js';
import { PurchaseOptionsController } from './common/presentation/purchase-options.controller.js';
import { GrnsService } from './grns/application/grns.service.js';
import { GrnsController } from './grns/presentation/grns.controller.js';
import { LandedCostService } from './landed-cost/application/landed-cost.service.js';
import { LandedCostController } from './landed-cost/presentation/landed-cost.controller.js';
import { PurchaseOrdersService } from './orders/application/purchase-orders.service.js';
import { PurchaseOrdersController } from './orders/presentation/purchase-orders.controller.js';
import { VendorPaymentsService } from './payments/application/vendor-payments.service.js';
import { VendorPaymentsController } from './payments/presentation/vendor-payments.controller.js';
import { PayablesReportsService } from './reports/application/payables-reports.service.js';
import { PurchaseReturnsService } from './returns/application/purchase-returns.service.js';
import { PurchaseReturnsController } from './returns/presentation/purchase-returns.controller.js';

/**
 * Purchasing (Phase 19): purchase orders (approval subject PO), goods received notes, vendor bills and the counter
 * purchase voucher (approval subject BILL), landed cost for imports. Payables (Phase 20): purchase returns, debit notes,
 * vendor payments with allocations and the payment run (approval subject PAY), AP ageing and vendor statements.
 * Posting runs in the database's Purchases functions.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [
    PurchaseOptionsController, PurchaseOrdersController, GrnsController, VendorBillsController, PurchaseVouchersController, LandedCostController,
    PurchaseReturnsController, DebitNotesController, VendorPaymentsController,
  ],
  providers: [
    { provide: PurchasingStore, useClass: PrismaPurchasingStore },
    { provide: PayablesStore, useClass: PrismaPayablesStore },
    PurchaseOptionsService, PurchaseOrdersService, GrnsService, VendorBillsService, LandedCostService,
    PurchaseReturnsService, DebitNotesService, VendorPaymentsService, PayablesReportsService,
  ],
  // stock demands (Phase 22) convert into draft purchase orders
  exports: [PurchaseOrdersService],
})
export class PurchasingModule {}
