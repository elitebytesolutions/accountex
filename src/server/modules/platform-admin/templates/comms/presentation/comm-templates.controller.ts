import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CommPreviewSchema, CommTemplateCreateSchema, CommTemplateUpdateSchema, RowVersionSchema,
  type AdminSession, type CommPreviewInput, type CommTemplateCreate, type CommTemplateUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { CommTemplatesService } from '../application/comm-templates.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/comm-templates: Operations › Support › Communications (template list, EN / UR editor, live preview). */
@AdminRoute()
@Controller('admin/comm-templates')
export class CommTemplatesController {
  constructor(private readonly templates: CommTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.templates.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(CommTemplateCreateSchema)) body: CommTemplateCreate) {
    return this.templates.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CommTemplateUpdateSchema)) body: CommTemplateUpdate) {
    return this.templates.update(admin, meta, id, body);
  }

  @Post(':id/preview')
  @HttpCode(200)
  preview(@Param('id', uuid) id: string, @Body(pipe(CommPreviewSchema)) body: CommPreviewInput) {
    return this.templates.preview(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.templates.delete(admin, meta, id, q.rowVersion);
  }
}
