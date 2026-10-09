import { Controller, Get, Query } from '@nestjs/common';
import { ReportQuerySchema, type ReportQuery, type SessionUser } from '../../../../../shared/index.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import { LedgerReportsService } from '../application/ledger-reports.service.js';

const pipe = new ZodValidationPipe(ReportQuerySchema);

/** /api/reports/{trial-balance,gl,day-book}: the ledger reports. */
@Controller('reports')
export class LedgerReportsController {
  constructor(private readonly reports: LedgerReportsService) {}

  @Get('trial-balance')
  @RequirePermission('vch:view')
  trialBalance(@CurrentUser() user: SessionUser, @Query(pipe) q: ReportQuery) {
    return this.reports.trialBalance(user, q);
  }

  @Get('gl')
  @RequirePermission('vch:view')
  generalLedger(@CurrentUser() user: SessionUser, @Query(pipe) q: ReportQuery) {
    return this.reports.generalLedger(user, q);
  }

  @Get('day-book')
  @RequirePermission('vch:view')
  dayBook(@CurrentUser() user: SessionUser, @Query(pipe) q: ReportQuery) {
    return this.reports.dayBook(user, q);
  }
}
