import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  BatchCreateSchema,
  BatchDispositionSchema,
  BatchListQuerySchema,
  BatchUpdateSchema,
  type BatchCreate,
  type BatchDispositionChange,
  type BatchListQuery,
  type BatchUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BatchesService } from '../application/batches.service.js';

const uuid = new ParseUUIDPipe();

/** /api/inventory/batches: Inventory › Stock › Batches & Expiry. */
@Controller('inventory/batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(BatchListQuerySchema)) q: BatchListQuery) {
    return this.batches.list(user, q);
  }

  @Get('summary')
  @RequirePermission('item:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.batches.summary(user);
  }

  @Post()
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BatchCreateSchema)) body: BatchCreate) {
    return this.batches.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BatchUpdateSchema)) body: BatchUpdate) {
    return this.batches.update(user, meta, id, body);
  }

  @Post(':id/disposition')
  @HttpCode(200)
  @RequirePermission('item:edit')
  setDisposition(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(BatchDispositionSchema)) body: BatchDispositionChange) {
    return this.batches.setDisposition(user, meta, id, body);
  }
}
