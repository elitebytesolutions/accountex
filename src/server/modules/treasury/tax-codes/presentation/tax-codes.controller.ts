import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  RowVersionSchema,
  TaxCodeCreateSchema,
  TaxCodeUpdateSchema,
  type SessionUser,
  type TaxCodeCreate,
  type TaxCodeUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { TaxCodesService } from '../application/tax-codes.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/tax/codes: Tax & Compliance › Tax Codes. The `tax` resource has no delete action; deleting an unused code needs tax:edit. */
@Controller('tax/codes')
export class TaxCodesController {
  constructor(private readonly codes: TaxCodesService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser) {
    return this.codes.list(user);
  }

  @Get(':id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.codes.get(user, id);
  }

  @Post()
  @RequirePermission('tax:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(TaxCodeCreateSchema)) body: TaxCodeCreate) {
    return this.codes.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('tax:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(TaxCodeUpdateSchema)) body: TaxCodeUpdate) {
    return this.codes.update(user, meta, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  activate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.codes.setActive(user, meta, id, true, body.rowVersion);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('tax:edit')
  deactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.codes.setActive(user, meta, id, false, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tax:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.codes.delete(user, meta, id, q.rowVersion);
  }
}
