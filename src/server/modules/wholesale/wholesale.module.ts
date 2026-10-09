import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { BackOrdersService } from './backorders/application/back-orders.service.js';
import { BackOrdersController } from './backorders/presentation/back-orders.controller.js';
import { OrderBookingsService } from './bookings/application/order-bookings.service.js';
import { OrderBookingsController } from './bookings/presentation/order-bookings.controller.js';
import { BulkInvoiceRunsService } from './bulk/application/bulk-invoice-runs.service.js';
import { BulkInvoiceRunsController } from './bulk/presentation/bulk-invoice-runs.controller.js';
import { WholesaleStore } from './common/application/wholesale-store.js';
import { PrismaWholesaleStore } from './common/infrastructure/prisma-wholesale.store.js';
import { QuickEntryService } from './entry/application/quick-entry.service.js';
import { HeldBillsController, OrderTemplatesController, QuickEntryController, WholesaleOptionsController } from './entry/presentation/quick-entry.controller.js';
import { OrderTemplatesService } from './templates/application/order-templates.service.js';

/**
 * Wholesale (Phase 25): Quick Wholesale Entry with held bills and order templates, order bookings from the field,
 * bulk invoicing of a route and back-orders. Every invoice is a WHOLESALE Sales invoice created and posted through the
 * Phase 23 invoice service; the Distribution schema keeps the bookings, runs, held bills and back-orders.
 */
@Module({
  imports: [SalesModule],
  controllers: [WholesaleOptionsController, QuickEntryController, HeldBillsController, OrderTemplatesController, OrderBookingsController, BulkInvoiceRunsController, BackOrdersController],
  providers: [
    { provide: WholesaleStore, useClass: PrismaWholesaleStore },
    QuickEntryService, OrderTemplatesService, OrderBookingsService, BulkInvoiceRunsService, BackOrdersService,
  ],
})
export class WholesaleModule {}
