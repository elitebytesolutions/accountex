import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  CommissionSlabsQuerySchema, CommissionSlabsSaveSchema, type CommissionSlabsQuery, type CommissionSlabsSave,
} from '../../../../../shared/distribution/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CommissionSlabsService } from '../application/commission-slabs.service.js';

/**
 * /api/distribution/commission-slabs: the "Commission slabs" table on Wholesale › Routes & Salesmen.
 * Viewing needs target:view; changing needs target:edit (there is no target:delete, so removing a band needs it too).
 */
@Controller('distribution/commission-slabs')
export class CommissionSlabsController {
  constructor(private readonly slabs: CommissionSlabsService) {}

  @Get()
  @RequirePermission('target:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(CommissionSlabsQuerySchema)) q: CommissionSlabsQuery) {
    return this.slabs.list(user, q.asOf);
  }

  @Put()
  @RequirePermission('target:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(CommissionSlabsSaveSchema)) body: CommissionSlabsSave) {
    return this.slabs.save(user, meta, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('target:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.slabs.delete(user, meta, id, q.rowVersion);
  }
}
