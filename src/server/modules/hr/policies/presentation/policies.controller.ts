import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CompanyPolicyCreateSchema, CompanyPolicyUpdateSchema, RowVersionSchema, TalentListQuerySchema,
  type CompanyPolicyCreate, type CompanyPolicyUpdate, type SessionUser, type TalentListQuery,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PoliciesService } from '../application/policies.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr/policies: Workforce › Talent › Policies (EmployeeSelfService.CompanyPolicies, versioned). */
@Controller('hr/policies')
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(TalentListQuerySchema)) q: TalentListQuery) {
    return this.policies.list(user, q);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.policies.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(CompanyPolicyCreateSchema)) body: CompanyPolicyCreate) {
    return this.policies.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CompanyPolicyUpdateSchema)) body: CompanyPolicyUpdate) {
    return this.policies.update(user, meta, id, body);
  }

  /** A new version is a new row, so it needs emp:create. */
  @Post(':id/new-version')
  @HttpCode(200)
  @RequirePermission('emp:create')
  newVersion(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.policies.newVersion(user, meta, id, body.rowVersion);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['publish', 'retire']))) action: 'publish' | 'retire', @Body(version) body: { rowVersion: number }) {
    return this.policies[action](user, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.policies.delete(user, meta, id, q.rowVersion);
  }
}
