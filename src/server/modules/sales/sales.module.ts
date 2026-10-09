import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { DeliveryChallansService } from './challans/application/delivery-challans.service.js';
import { DeliveryChallansController } from './challans/presentation/delivery-challans.controller.js';
import { SalesOptionsService } from './common/application/sales-options.service.js';
import { SalesStore } from './common/application/sales-store.js';
import { PrismaSalesStore } from './common/infrastructure/prisma-sales.store.js';
import { SalesOptionsController } from './common/presentation/sales-options.controller.js';
import { SalesInvoicesService } from './invoices/application/sales-invoices.service.js';
import { SalesInvoicesController, SalesVouchersController } from './invoices/presentation/sales-invoices.controller.js';
import { SalesOrdersService } from './orders/application/sales-orders.service.js';
import { SalesOrdersController } from './orders/presentation/sales-orders.controller.js';
import { QuotationsService } from './quotations/application/quotations.service.js';
import { QuotationsController } from './quotations/presentation/quotations.controller.js';

/**
 * Sales documents (Phase 23): quotations → sales orders (approval subject SO, credit check, stock reservations) →
 * delivery challans (stock out at dispatch) → sales invoices and the counter sales voucher (approval subject INV,
 * FBR submission queued on posting). Posting runs in the database's Sales functions.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [SalesOptionsController, QuotationsController, SalesOrdersController, DeliveryChallansController, SalesInvoicesController, SalesVouchersController],
  providers: [
    { provide: SalesStore, useClass: PrismaSalesStore },
    SalesOptionsService, QuotationsService, SalesOrdersService, DeliveryChallansService, SalesInvoicesService,
  ],
  /** Phase 24 (recurring invoices, POS) creates and posts invoices through the invoice service. */
  exports: [SalesInvoicesService, SalesStore],
})
export class SalesModule {}
