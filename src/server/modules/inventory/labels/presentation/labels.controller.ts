import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  LabelJobCreateSchema,
  LabelTemplateCreateSchema,
  LabelTemplateUpdateSchema,
  RowVersionSchema,
  type LabelJobCreate,
  type LabelTemplateCreate,
  type LabelTemplateUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { LabelsService } from '../application/labels.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/label-templates and /api/inventory/label-jobs: Inventory › Products › Barcode Labels. */
@Controller('inventory')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get('label-templates')
  @RequirePermission('item:view')
  templates(@CurrentUser() user: SessionUser) {
    return this.labels.templates(user);
  }

  @Post('label-templates')
  @RequirePermission('item:create')
  createTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(LabelTemplateCreateSchema)) body: LabelTemplateCreate) {
    return this.labels.createTemplate(user, meta, body);
  }

  @Patch('label-templates/:id')
  @RequirePermission('item:edit')
  updateTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(LabelTemplateUpdateSchema)) body: LabelTemplateUpdate) {
    return this.labels.updateTemplate(user, meta, id, body);
  }

  @Delete('label-templates/:id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async deleteTemplate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.labels.deleteTemplate(user, meta, id, q.rowVersion);
  }

  @Get('label-jobs')
  @RequirePermission('item:view')
  jobs(@CurrentUser() user: SessionUser) {
    return this.labels.jobs(user);
  }

  /** Printing (recording a job) is a change: item:edit, so read-only roles can't; the job records who printed. */
  @Post('label-jobs')
  @RequirePermission('item:edit')
  recordJob(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(LabelJobCreateSchema)) body: LabelJobCreate) {
    return this.labels.recordJob(user, meta, body);
  }
}
