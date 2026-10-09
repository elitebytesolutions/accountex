import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ClaimPaySchema, ClaimQuerySchema, ClaimRejectSchema, ClaimSchema, ClaimUpdateSchema, RowVersionSchema, type ClaimInput, type ClaimPayInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ExpenseClaimsService } from '../application/expense-claims.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const version = pipe(RowVersionSchema);
const PayMany = z.object({ ids: z.array(z.uuid()).min(1).max(200) }).and(ClaimPaySchema);

/** /api/cash/expense-claims: Finance › Cash › Expense Claims (approve / reject / pay). */
@Controller('cash/expense-claims')
export class ExpenseClaimsController {
  constructor(private readonly claims: ExpenseClaimsService) {}

  @Get()
  @RequirePermission('cash:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ClaimQuerySchema)) q: z.infer<typeof ClaimQuerySchema>) {
    return this.claims.list(user, q);
  }

  @Post('pay-approved')
  @HttpCode(200)
  @RequirePermission('cash:post')
  payMany(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(PayMany)) body: z.infer<typeof PayMany>) {
    return this.claims.payMany(user, meta, body.ids, body);
  }

  @Get(':id')
  @RequirePermission('cash:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.claims.get(user, id);
  }

  /** Eligibility is the approval engine's (the claim's current step); no workflow: cash:approve. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('cash:view')
  approve(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(z.object({ comment: z.string().trim().max(500).optional() }))) body: { comment?: string }) {
    return this.claims.approve(user, meta, id, body.comment ?? null);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('cash:view')
  reject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ClaimRejectSchema)) body: z.infer<typeof ClaimRejectSchema>) {
    return this.claims.reject(user, meta, id, { ...body, comment: body.comment ?? null });
  }

  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermission('cash:post')
  pay(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ClaimPaySchema)) body: ClaimPayInput) {
    return this.claims.pay(user, meta, id, body);
  }
}

/** /api/me/expense-claims: My Profile › Expense Claims (own claims only). */
@Controller('me/expense-claims')
export class MyExpenseClaimsController {
  constructor(private readonly claims: ExpenseClaimsService) {}

  @Get()
  @RequirePermission('myexp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ClaimQuerySchema)) q: z.infer<typeof ClaimQuerySchema>) {
    return this.claims.mine(user, q);
  }

  @Get('options')
  @RequirePermission('myexp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.claims.myOptions(user);
  }

  @Get(':id')
  @RequirePermission('myexp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.claims.get(user, id, true);
  }

  @Post()
  @RequirePermission('myexp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ClaimSchema)) body: ClaimInput) {
    return this.claims.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('myexp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ClaimUpdateSchema)) body: ClaimInput & { rowVersion: number }) {
    return this.claims.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('myexp:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.claims.remove(user, meta, id, q.rowVersion);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('myexp:create')
  submit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.claims.submit(user, meta, id, body.rowVersion);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermission('myexp:edit')
  withdraw(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.claims.withdraw(user, meta, id, body.rowVersion);
  }

  @Post(':id/resubmit')
  @RequirePermission('myexp:create')
  resubmit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.claims.resubmit(user, meta, id, body.rowVersion);
  }
}
