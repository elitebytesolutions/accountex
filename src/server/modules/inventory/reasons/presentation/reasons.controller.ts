import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  MovementReasonCreateSchema,
  MovementReasonUpdateSchema,
  REASON_DIRECTIONS,
  RowVersionSchema,
  type MovementReasonCreate,
  type MovementReasonUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReasonsService } from '../application/reasons.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/movement-reasons: Inventory › Stock › Movement Reasons. */
@Controller('inventory/movement-reasons')
export class ReasonsController {
  constructor(private readonly reasons: ReasonsService) {}

  @Get()
  @RequirePermission('adj:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ direction: z.enum(REASON_DIRECTIONS).optional() }))) q: { direction?: string }) {
    return this.reasons.list(user, q.direction);
  }

  @Get('expense-accounts')
  @RequirePermission('adj:view')
  expenseAccounts(@CurrentUser() user: SessionUser) {
    return this.reasons.expenseAccounts(user);
  }

  @Post()
  @RequirePermission('adj:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(MovementReasonCreateSchema)) body: MovementReasonCreate) {
    return this.reasons.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('adj:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(MovementReasonUpdateSchema)) body: MovementReasonUpdate) {
    return this.reasons.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('adj:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.reasons.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('adj:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.reasons.delete(user, meta, id, q.rowVersion);
  }
}
