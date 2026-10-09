import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CategoriseSchema, LineActionSchema, RowVersionSchema, StatementImportSchema, type SessionUser, type StatementImportInput } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { StatementImportsService } from '../application/statement-imports.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(LineActionSchema);

/** /api/bank/statement-imports and /api/bank/statement-lines: statement import on Bank Rules / Bank Transactions. */
@Controller('bank')
export class StatementImportsController {
  constructor(private readonly imports: StatementImportsService) {}

  @Get('statement-imports')
  @RequirePermission('bank:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ account: z.uuid().optional() }))) q: { account?: string }) {
    return this.imports.list(user, q.account ?? null);
  }

  @Get('statement-imports/:id')
  @RequirePermission('bank:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.imports.get(user, id);
  }

  @Post('statement-imports')
  @RequirePermission('bank:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(StatementImportSchema)) body: StatementImportInput) {
    return this.imports.import(user, meta, body);
  }

  @Post('statement-imports/:id/apply-rules')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  applyRules(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.imports.applyRules(user, meta, id);
  }

  @Delete('statement-imports/:id')
  @HttpCode(204)
  @RequirePermission('bank:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.imports.delete(user, meta, id, q.rowVersion);
  }

  @Post('statement-lines/:id/categorise')
  @HttpCode(200)
  @RequirePermission('bank:create')
  categorise(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CategoriseSchema)) body: z.infer<typeof CategoriseSchema>) {
    return this.imports.categoriseLine(user, meta, id, body);
  }

  @Post('statement-lines/:id/ignore')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  ignore(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.imports.ignore(user, meta, id, body.rowVersion);
  }

  @Post('statement-lines/:id/restore')
  @HttpCode(200)
  @RequirePermission('bank:edit')
  restore(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.imports.restore(user, meta, id, body.rowVersion);
  }
}
