import { Module } from '@nestjs/common';
import { PeriodCloseStore } from './common/application/period-close-store.js';
import { PrismaPeriodCloseStore } from './common/infrastructure/prisma-period-close.store.js';
import { ReminderRunsController, ReopenRequestsController, StatementsController, YearEndController } from './common/presentation/period-close.controller.js';
import { ReminderRunsService } from './reminders/application/reminder-runs.service.js';
import { ReopenRequestsService } from './reopen/application/reopen-requests.service.js';
import { StatementsService } from './statements/application/statements.service.js';
import { YearEndService } from './year-end/application/year-end.service.js';

/**
 * Period close (Phase 29): period reopen requests (permission-approved, auto re-close), the year-end close wizard
 * (closing JE + lock), payment reminder runs into the outbox, and the P&L / Balance Sheet / Cash Flow statements.
 */
@Module({
  controllers: [ReopenRequestsController, YearEndController, ReminderRunsController, StatementsController],
  providers: [{ provide: PeriodCloseStore, useClass: PrismaPeriodCloseStore }, ReopenRequestsService, YearEndService, ReminderRunsService, StatementsService],
})
export class PeriodCloseModule {}
