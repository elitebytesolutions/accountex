import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  DocumentTemplateSaveSchema,
  DocumentTemplateUpdateSchema,
  RowVersionSchema,
  type DocumentTemplateSave,
  type DocumentTemplateUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { TemplatesService } from '../application/templates.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/settings/document-templates: Settings › Document Templates (comp permissions, as for company settings). */
@Controller('settings/document-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission('comp:view')
  list(@CurrentUser() user: SessionUser) {
    return this.templates.list(user);
  }

  @Get(':id')
  @RequirePermission('comp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.templates.get(user, id);
  }

  @Post()
  @RequirePermission('comp:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(DocumentTemplateSaveSchema)) body: DocumentTemplateSave) {
    return this.templates.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('comp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(DocumentTemplateUpdateSchema)) body: DocumentTemplateUpdate) {
    return this.templates.update(user, meta, id, body);
  }

  @Post(':id/set-default')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  setDefault(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.templates.setDefault(user, meta, id, body.rowVersion);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  activate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.templates.setStatus(user, meta, id, 'ACTIVE', body.rowVersion);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  deactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.templates.setStatus(user, meta, id, 'ARCHIVED', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('comp:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.templates.delete(user, meta, id, q.rowVersion);
  }
}
