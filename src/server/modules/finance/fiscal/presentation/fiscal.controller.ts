import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { FiscalYearCreateSchema, PeriodActionSchema, type FiscalYearCreate, type PeriodAction, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { FiscalService } from '../application/fiscal.service.js';

const uuid = new ParseUUIDPipe();
const action = new ZodValidationPipe(PeriodActionSchema);

/** /api/accounting/fiscal-years and /api/accounting/periods: Period Close › Fiscal periods. */
@Controller('accounting')
export class FiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get('fiscal-years')
  @RequirePermission('close:view')
  list(@CurrentUser() user: SessionUser) {
    return this.fiscal.list(user);
  }

  @Post('fiscal-years')
  @RequirePermission('close:approve')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(FiscalYearCreateSchema)) body: FiscalYearCreate) {
    return this.fiscal.create(user, meta, body);
  }

  @Post('periods/:id/close')
  @HttpCode(200)
  @RequirePermission('close:approve')
  close(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: PeriodAction) {
    return this.fiscal.close(user, meta, id, body);
  }

  @Post('periods/:id/lock')
  @HttpCode(200)
  @RequirePermission('close:approve')
  lock(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: PeriodAction) {
    return this.fiscal.lock(user, meta, id, body);
  }

  @Post('periods/:id/reopen')
  @HttpCode(200)
  @RequirePermission('close:approve')
  reopen(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(action) body: PeriodAction) {
    return this.fiscal.reopen(user, meta, id, body);
  }
}
