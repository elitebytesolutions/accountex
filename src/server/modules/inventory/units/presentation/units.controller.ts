import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, UnitCreateSchema, UnitUpdateSchema, type SessionUser, type UnitCreate, type UnitUpdate } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { UnitsService } from '../application/units.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/units: Inventory › Products › Units of Measure. */
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser) {
    return this.units.list(user);
  }

  @Post()
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(UnitCreateSchema)) body: UnitCreate) {
    return this.units.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(UnitUpdateSchema)) body: UnitUpdate) {
    return this.units.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('item:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.units.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.units.delete(user, meta, id, q.rowVersion);
  }
}
