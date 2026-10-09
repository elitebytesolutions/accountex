import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { PurchasingModule } from '../purchasing/purchasing.module.js';
import { StockAdjustmentsService } from './adjustments/application/stock-adjustments.service.js';
import { StockOpsStore } from './common/application/stock-ops-store.js';
import { PrismaStockOpsStore } from './common/infrastructure/prisma-stock-ops.store.js';
import { StockAdjustmentsController, StockCountsController, StockEntriesController, StockOpsController, StockTransfersController } from './common/presentation/stock-ops.controller.js';
import { StockCountsService } from './counts/application/stock-counts.service.js';
import { DemandService } from './demand/application/demand.service.js';
import { StockDemandStore } from './demand/application/stock-demand-store.js';
import { StockVouchersService } from './demand/application/stock-vouchers.service.js';
import { PrismaStockDemandStore } from './demand/infrastructure/prisma-stock-demand.store.js';
import { DemandController, StockVouchersController } from './demand/presentation/stock-demand.controller.js';
import { StockEntriesService } from './entries/application/stock-entries.service.js';
import { StockTransfersService } from './transfers/application/stock-transfers.service.js';

/**
 * Stock operations (Phase 21): manual stock in / out, transfers (dispatch → receive), adjustments (approval subject
 * ADJ) and stock counts. Phase 22: stock / assembly vouchers, goods demand (→ draft PO), principal claims & targets,
 * bulk price updates. Posting runs in the database's Inventory functions (stock ledger + journal).
 */
@Module({
  imports: [ApprovalsModule, PurchasingModule],
  controllers: [StockOpsController, StockEntriesController, StockTransfersController, StockAdjustmentsController, StockCountsController, StockVouchersController, DemandController],
  providers: [
    { provide: StockOpsStore, useClass: PrismaStockOpsStore }, StockEntriesService, StockTransfersService, StockAdjustmentsService, StockCountsService,
    { provide: StockDemandStore, useClass: PrismaStockDemandStore }, StockVouchersService, DemandService,
  ],
})
export class InventoryOpsModule {}
