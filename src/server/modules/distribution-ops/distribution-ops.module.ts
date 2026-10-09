import { Module } from '@nestjs/common';
import { ReceivablesOpsModule } from '../receivables-ops/receivables-ops.module.js';
import { DistributionOpsStore } from './common/application/distribution-ops-store.js';
import { PrismaDistributionOpsStore } from './common/infrastructure/prisma-distribution-ops.store.js';
import {
  CreditControlController, LoadSheetsController, RecoverySheetsController, RouteSettlementsController, TargetsController,
} from './common/presentation/distribution-ops.controller.js';
import { CreditControlService } from './credit/application/credit-control.service.js';
import { LoadSheetsService } from './load-sheets/application/load-sheets.service.js';
import { RecoverySheetsService } from './recovery/application/recovery-sheets.service.js';
import { RouteSettlementsService } from './settlements/application/route-settlements.service.js';
import { TargetsService } from './targets/application/targets.service.js';

/**
 * Distribution (Phase 26): load sheets (paperwork only: pick list, gate pass, deliveries), route settlements and
 * recovery sheets (receipts and returns through the Phase 24 services), salesman targets & commissions (accrual +
 * payroll adjustment) and credit control (holds, override requests). Wholesale invoices come from Phase 25.
 */
@Module({
  imports: [ReceivablesOpsModule],
  controllers: [LoadSheetsController, RouteSettlementsController, RecoverySheetsController, TargetsController, CreditControlController],
  providers: [
    { provide: DistributionOpsStore, useClass: PrismaDistributionOpsStore },
    LoadSheetsService, RouteSettlementsService, RecoverySheetsService, TargetsService, CreditControlService,
  ],
})
export class DistributionOpsModule {}
