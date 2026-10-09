import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { OpeningStore } from './opening-balances/application/opening-store.js';
import { OpeningBalancesService } from './opening-balances/application/opening-balances.service.js';
import { PrismaOpeningStore } from './opening-balances/infrastructure/prisma-opening.store.js';
import { OpeningBalancesController } from './opening-balances/presentation/opening-balances.controller.js';
import { RecurringStore } from './recurring/application/recurring-store.js';
import { RecurringService } from './recurring/application/recurring.service.js';
import { PrismaRecurringStore } from './recurring/infrastructure/prisma-recurring.store.js';
import { RecurringController } from './recurring/presentation/recurring.controller.js';
import { LedgerReportStore } from './reports/application/ledger-report-store.js';
import { LedgerReportsService } from './reports/application/ledger-reports.service.js';
import { PrismaLedgerReportStore } from './reports/infrastructure/prisma-ledger-report.store.js';
import { LedgerReportsController } from './reports/presentation/ledger-reports.controller.js';
import { VoucherStore } from './vouchers/application/voucher-store.js';
import { VouchersService } from './vouchers/application/vouchers.service.js';
import { PrismaVoucherStore } from './vouchers/infrastructure/prisma-voucher.store.js';
import { VouchersController } from './vouchers/presentation/vouchers.controller.js';

/** General ledger (Phase 16): journal vouchers, opening balances, recurring vouchers and the ledger reports. */
@Module({
  imports: [ApprovalsModule],
  controllers: [VouchersController, OpeningBalancesController, RecurringController, LedgerReportsController],
  providers: [
    VouchersService, { provide: VoucherStore, useClass: PrismaVoucherStore },
    OpeningBalancesService, { provide: OpeningStore, useClass: PrismaOpeningStore },
    RecurringService, { provide: RecurringStore, useClass: PrismaRecurringStore },
    LedgerReportsService, { provide: LedgerReportStore, useClass: PrismaLedgerReportStore },
  ],
  exports: [VouchersService],
})
export class LedgerModule {}
