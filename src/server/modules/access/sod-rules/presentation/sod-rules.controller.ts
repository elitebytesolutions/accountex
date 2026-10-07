import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, SodRuleCreateSchema, SodRuleUpdateSchema, type SessionUser, type SodRuleCreate, type SodRuleUpdate } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SodRulesService } from '../application/sod-rules.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/settings/sod-rules: Settings › Roles & Permissions › Segregation of duties. */
@Controller('settings/sod-rules')
export class SodRulesController {
  constructor(private readonly rules: SodRulesService) {}

  @Get()
  @RequirePermission('rol:view')
  list(@CurrentUser() user: SessionUser) {
    return this.rules.list(user);
  }

  @Post()
  @RequirePermission('rol:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(SodRuleCreateSchema)) body: SodRuleCreate) {
    return this.rules.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('rol:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(SodRuleUpdateSchema)) body: SodRuleUpdate) {
    return this.rules.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('rol:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.rules.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('rol:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.rules.delete(user, meta, id, q.rowVersion);
  }
}
