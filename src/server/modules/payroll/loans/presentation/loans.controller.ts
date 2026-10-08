import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { LoanApproveSchema, LoanCreateSchema, LoanDisburseSchema, LoanReasonSchema, MyLoanCreateSchema, type LoanCreate, type MyLoanCreate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LoansService } from '../application/loans.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const LoanQuerySchema = z.object({
  status: z.string().trim().max(20).optional(), type: z.enum(['LOAN', 'ADVANCE']).optional(), search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** /api/payroll/loans: Workforce › Loans & Advances. */
@Controller('payroll/loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  @RequirePermission('loan:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(LoanQuerySchema)) q: z.infer<typeof LoanQuerySchema>) {
    return this.loans.list(user, q);
  }

  @Get('eligibility')
  @RequirePermission('loan:view')
  eligibility(@CurrentUser() user: SessionUser, @Query(pipe(z.object({ employee: z.uuid() }))) q: { employee: string }) {
    return this.loans.eligibility(user, q.employee);
  }

  @Get(':id')
  @RequirePermission('loan:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.loans.get(user, id);
  }

  @Post()
  @RequirePermission('loan:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(LoanCreateSchema)) body: LoanCreate) {
    return this.loans.create(user, meta, body);
  }

  /** The approval engine decides who may approve; without a workflow, loan:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('loan:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LoanApproveSchema)) body: z.infer<typeof LoanApproveSchema>) {
    return this.loans.approve(user, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('loan:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LoanReasonSchema)) body: { reason: string }) {
    return this.loans.reject(user, meta, id, body.reason);
  }

  @Post(':id/disburse')
  @HttpCode(200)
  @RequirePermission('loan:post')
  disburse(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LoanDisburseSchema)) body: z.infer<typeof LoanDisburseSchema>) {
    return this.loans.disburse(user, meta, id, body);
  }
}

/** /api/me/loans: My Profile › Loans & Advances (own loans only). */
@Controller('me/loans')
export class MyLoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  @RequirePermission('myloan:view')
  list(@CurrentUser() user: SessionUser) {
    return this.loans.myList(user);
  }

  @Get('eligibility')
  @RequirePermission('myloan:view')
  eligibility(@CurrentUser() user: SessionUser) {
    return this.loans.myEligibility(user);
  }

  @Get(':id')
  @RequirePermission('myloan:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.loans.myGet(user, id);
  }

  @Post()
  @RequirePermission('myloan:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(MyLoanCreateSchema)) body: MyLoanCreate) {
    return this.loans.myCreate(user, meta, body);
  }
}
