import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, SchemeCreateSchema, SchemeListQuerySchema, SchemeUpdateSchema, type SchemeCreate, type SchemeListQuery, type SchemeUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SchemesService } from '../application/schemes.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/sales/schemes: Sales › Price Lists & Schemes › Schemes. Changes need quo:approve; delete quo:delete. */
@Controller('sales/schemes')
export class SchemesController {
  constructor(private readonly schemes: SchemesService) {}

  @Get()
  @RequirePermission('quo:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SchemeListQuerySchema)) q: SchemeListQuery) {
    return this.schemes.list(user, q);
  }

  @Get('summary')
  @RequirePermission('quo:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.schemes.summary(user);
  }

  @Get(':id')
  @RequirePermission('quo:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.schemes.get(user, id);
  }

  @Post()
  @RequirePermission('quo:approve')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SchemeCreateSchema)) body: SchemeCreate) {
    return this.schemes.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('quo:approve')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SchemeUpdateSchema)) body: SchemeUpdate) {
    return this.schemes.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('quo:approve')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.schemes.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('quo:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.schemes.delete(user, meta, id, q.rowVersion);
  }
}
