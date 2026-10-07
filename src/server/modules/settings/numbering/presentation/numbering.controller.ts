import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  NumberingSeriesCreateSchema,
  NumberingSeriesUpdateSchema,
  RowVersionSchema,
  type NumberingSeriesCreate,
  type NumberingSeriesUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { NumberingService } from '../application/numbering.service.js';

/** /api/settings/numbering-series and /api/settings/document-types: Settings › Numbering tab. */
@Controller('settings')
export class NumberingController {
  constructor(private readonly numbering: NumberingService) {}

  @Get('document-types')
  @RequirePermission('comp:view')
  documentTypes() {
    return this.numbering.documentTypes();
  }

  @Get('numbering-series')
  @RequirePermission('comp:view')
  list(@CurrentUser() user: SessionUser) {
    return this.numbering.list(user);
  }

  @Get('numbering-series/:id')
  @RequirePermission('comp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.numbering.get(user, id);
  }

  @Post('numbering-series')
  @RequirePermission('comp:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(NumberingSeriesCreateSchema)) body: NumberingSeriesCreate) {
    return this.numbering.create(user, meta, body);
  }

  @Patch('numbering-series/:id')
  @RequirePermission('comp:edit')
  update(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(NumberingSeriesUpdateSchema)) body: NumberingSeriesUpdate,
  ) {
    return this.numbering.update(user, meta, id, body);
  }

  @Delete('numbering-series/:id')
  @HttpCode(204)
  @RequirePermission('comp:edit')
  async delete(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number },
  ) {
    await this.numbering.delete(user, meta, id, q.rowVersion);
  }
}
