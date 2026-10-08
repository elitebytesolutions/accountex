import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, SalaryInputSchema, type SalaryInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SalariesService } from '../application/salaries.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const FirstSchema = SalaryInputSchema.extend({ employeeId: z.uuid('Choose the employee') });
const ReviseSchema = SalaryInputSchema.extend(RowVersionSchema.shape);

/** /api/payroll/employee-salaries: the Salary tab of the employee profile. Setting salaries needs prun:approve. */
@Controller('payroll/employee-salaries')
export class SalariesController {
  constructor(private readonly salaries: SalariesService) {}

  @Get()
  @RequirePermission('prun:view')
  view(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ employee: z.uuid() }))) q: { employee: string }) {
    return this.salaries.view(user, q.employee);
  }

  @Post()
  @RequirePermission('prun:approve')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(FirstSchema)) body: z.infer<typeof FirstSchema>) {
    const { employeeId, ...input } = body;
    return this.salaries.create(user, meta, employeeId, input as SalaryInput);
  }

  @Post(':employeeId/revise')
  @RequirePermission('prun:approve')
  revise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('employeeId', uuid) employeeId: string, @Body(pipe(ReviseSchema)) body: z.infer<typeof ReviseSchema>) {
    return this.salaries.revise(user, meta, employeeId, body);
  }

  @Delete(':id')
  @RequirePermission('prun:approve')
  remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number }) {
    return this.salaries.deleteLatest(user, meta, id, q.rowVersion);
  }
}
