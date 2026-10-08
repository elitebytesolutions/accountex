import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CoaTemplateActionSchema, CoaTemplateCreateSchema, CoaTemplateImportSchema, CoaTemplateUpdateSchema, RowVersionSchema,
  type AdminSession, type CoaTemplateCreate, type CoaTemplateImport, type CoaTemplateUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { CoaTemplatesService } from '../application/coa-templates.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const action = pipe(z.enum(['publish', 'retire', 'default']));

/** /api/admin/coa-templates: Tenants › Templates (COA cards, account tree editor, CSV import, publish / retire / default). */
@AdminRoute()
@Controller('admin/coa-templates')
export class CoaTemplatesController {
  constructor(private readonly templates: CoaTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.templates.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(CoaTemplateCreateSchema)) body: CoaTemplateCreate) {
    return this.templates.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CoaTemplateUpdateSchema)) body: CoaTemplateUpdate) {
    return this.templates.update(admin, meta, id, body);
  }

  @Post(':id/import')
  @HttpCode(200)
  import(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CoaTemplateImportSchema)) body: CoaTemplateImport) {
    return this.templates.importCsv(admin, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  setStatus(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Param('action', action) act: 'publish' | 'retire' | 'default', @Body(pipe(CoaTemplateActionSchema)) body: { rowVersion: number },
  ) {
    return this.templates.setStatus(admin, meta, id, body.rowVersion, act);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.templates.delete(admin, meta, id, q.rowVersion);
  }
}
