import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  OnboardingTemplateCreateSchema, OnboardingTemplateUpdateSchema, RowVersionSchema, TalentListQuerySchema,
  type OnboardingTemplateCreate, type OnboardingTemplateUpdate, type SessionUser, type TalentListQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OnboardingTemplatesService } from '../application/onboarding-templates.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/onboarding-templates: Workforce › Talent › Onboarding (checklist templates). */
@Controller('hr/onboarding-templates')
export class OnboardingTemplatesController {
  constructor(private readonly templates: OnboardingTemplatesService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TalentListQuerySchema)) q: TalentListQuery) {
    return this.templates.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.templates.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(OnboardingTemplateCreateSchema)) body: OnboardingTemplateCreate) {
    return this.templates.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(OnboardingTemplateUpdateSchema)) body: OnboardingTemplateUpdate) {
    return this.templates.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate', 'default']))) action: 'activate' | 'deactivate' | 'default', @Body(version) body: { rowVersion: number }) {
    return action === 'default' ? this.templates.makeDefault(user, meta, id, body.rowVersion) : this.templates.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.templates.delete(user, meta, id, q.rowVersion);
  }
}
