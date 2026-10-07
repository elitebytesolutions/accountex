import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BankRuleOrderSchema,
  BankRuleSaveSchema,
  BankRuleTestSchema,
  BankRuleUpdateSchema,
  RowVersionSchema,
  type BankRuleSave,
  type BankRuleTest,
  type BankRuleUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BankRulesService } from '../application/bank-rules.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/bank/rules: Bank › Rules & Import (rules part). */
@Controller('bank/rules')
export class BankRulesController {
  constructor(private readonly rules: BankRulesService) {}

  @Get()
  @RequirePermission('bank:view')
  list(@CurrentUser() user: SessionUser) {
    return this.rules.list(user);
  }

  @Post()
  @RequirePermission('bank:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BankRuleSaveSchema)) body: BankRuleSave) {
    return this.rules.create(user, meta, body);
  }

  @Put('order')
  @RequirePermission('bank:edit')
  reorder(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BankRuleOrderSchema)) body: { ids: string[] }) {
    return this.rules.reorder(user, meta, body.ids);
  }

  /** Test a draft (`draft` in the body) or all enabled rules against pasted sample lines. */
  @Post('test')
  @HttpCode(200)
  @RequirePermission('bank:view')
  testAll(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(BankRuleTestSchema)) body: BankRuleTest) {
    return this.rules.test(user, body);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePermission('bank:view')
  testOne(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BankRuleTestSchema)) body: BankRuleTest) {
    return this.rules.test(user, { lines: body.lines }, id);
  }

  @Patch(':id')
  @RequirePermission('bank:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BankRuleUpdateSchema)) body: BankRuleUpdate) {
    return this.rules.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  setEnabled(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['enable', 'disable']))) action: 'enable' | 'disable', @Body(version) body: { rowVersion: number }) {
    return this.rules.setEnabled(user, meta, id, action === 'enable', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('bank:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.rules.delete(user, meta, id, q.rowVersion);
  }
}
