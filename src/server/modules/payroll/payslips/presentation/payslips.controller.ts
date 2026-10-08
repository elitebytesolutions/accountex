import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PayslipsService } from '../application/payslips.service.js';

const uuid = new ParseUUIDPipe();
const QuerySchema = z.object({
  run: z.uuid().optional(), status: z.string().trim().max(20).optional(), search: z.string().trim().max(100).optional(), department: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** /api/payroll/payslips: Workforce › Payroll › Payslips and the printable payslip. */
@Controller('payroll/payslips')
export class PayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @Get()
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(QuerySchema)) q: z.infer<typeof QuerySchema>) {
    return this.payslips.list(user, q);
  }

  @Get(':id')
  @RequirePermission('prun:view')
  get(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(z.object({ print: z.enum(['1']).optional() }))) q: { print?: string }) {
    return this.payslips.get(user, meta, id, q.print === '1');
  }
}

/** /api/me/payslips: My Profile › Payslips (own, published payslips only). */
@Controller('me/payslips')
export class MyPayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @Get()
  @RequirePermission('mypay:view')
  list(@CurrentUser() user: SessionUser) {
    return this.payslips.mine(user);
  }

  @Get(':id')
  @RequirePermission('mypay:view')
  get(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.payslips.myGet(user, meta, id);
  }
}
