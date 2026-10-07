import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ReorderRuleCreateSchema, ReorderRuleUpdateSchema, RowVersionSchema, type ReorderRuleCreate, type ReorderRuleUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReorderService } from '../application/reorder.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/reorder-rules and /api/inventory/reorder-suggestions: product detail · Reorder settings; Demand & Reorder. */
@Controller('inventory')
export class ReorderController {
  constructor(private readonly reorder: ReorderService) {}

  @Get('reorder-rules')
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ product: z.uuid().optional() }))) q: { product?: string }) {
    return this.reorder.list(user, q.product);
  }

  @Get('reorder-suggestions')
  @RequirePermission('item:view')
  suggestions(@CurrentUser() user: SessionUser) {
    return this.reorder.suggestions(user);
  }

  @Post('reorder-rules')
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ReorderRuleCreateSchema)) body: ReorderRuleCreate) {
    return this.reorder.create(user, meta, body);
  }

  @Patch('reorder-rules/:id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ReorderRuleUpdateSchema)) body: ReorderRuleUpdate) {
    return this.reorder.update(user, meta, id, body);
  }

  @Delete('reorder-rules/:id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.reorder.delete(user, meta, id, q.rowVersion);
  }
}
