import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  AllocationRuleSaveSchema,
  AllocationRuleUpdateSchema,
  CostCentreCreateSchema,
  CostCentreUpdateSchema,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  RowVersionSchema,
  type AllocationRuleSave,
  type AllocationRuleUpdate,
  type CostCentreCreate,
  type CostCentreUpdate,
  type ProjectCreate,
  type ProjectUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CostCentresService } from '../application/cost-centres.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/accounting/cost-centres, /projects and /cost-allocation-rules: Cost Centres & Projects. */
@Controller('accounting')
export class CostCentresController {
  constructor(private readonly costs: CostCentresService) {}

  @Get('cost-centres')
  @RequirePermission('coa:view')
  centres(@CurrentUser() user: SessionUser) {
    return this.costs.centres(user);
  }

  @Post('cost-centres')
  @RequirePermission('coa:create')
  createCentre(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(CostCentreCreateSchema)) body: CostCentreCreate) {
    return this.costs.createCentre(user, meta, body);
  }

  @Patch('cost-centres/:id')
  @RequirePermission('coa:edit')
  updateCentre(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CostCentreUpdateSchema)) body: CostCentreUpdate) {
    return this.costs.updateCentre(user, meta, id, body);
  }

  @Post('cost-centres/:id/deactivate')
  @HttpCode(200)
  @RequirePermission('coa:edit')
  deactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.costs.setCentreStatus(user, meta, id, 'INACTIVE', body.rowVersion);
  }

  @Post('cost-centres/:id/activate')
  @HttpCode(200)
  @RequirePermission('coa:edit')
  activate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.costs.setCentreStatus(user, meta, id, 'ACTIVE', body.rowVersion);
  }

  @Delete('cost-centres/:id')
  @HttpCode(204)
  @RequirePermission('coa:delete')
  async deleteCentre(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.costs.deleteCentre(user, meta, id, q.rowVersion);
  }

  @Get('projects')
  @RequirePermission('coa:view')
  projects(@CurrentUser() user: SessionUser) {
    return this.costs.projects(user);
  }

  @Post('projects')
  @RequirePermission('coa:create')
  createProject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ProjectCreateSchema)) body: ProjectCreate) {
    return this.costs.createProject(user, meta, body);
  }

  @Patch('projects/:id')
  @RequirePermission('coa:edit')
  updateProject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ProjectUpdateSchema)) body: ProjectUpdate) {
    return this.costs.updateProject(user, meta, id, body);
  }

  @Delete('projects/:id')
  @HttpCode(204)
  @RequirePermission('coa:delete')
  async deleteProject(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.costs.deleteProject(user, meta, id, q.rowVersion);
  }

  @Get('cost-allocation-rules')
  @RequirePermission('coa:view')
  rules(@CurrentUser() user: SessionUser) {
    return this.costs.rules(user);
  }

  @Post('cost-allocation-rules')
  @RequirePermission('coa:create')
  createRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AllocationRuleSaveSchema)) body: AllocationRuleSave) {
    return this.costs.createRule(user, meta, body);
  }

  @Patch('cost-allocation-rules/:id')
  @RequirePermission('coa:edit')
  updateRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(AllocationRuleUpdateSchema)) body: AllocationRuleUpdate) {
    return this.costs.updateRule(user, meta, id, body);
  }

  @Delete('cost-allocation-rules/:id')
  @HttpCode(204)
  @RequirePermission('coa:delete')
  async deleteRule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.costs.deleteRule(user, meta, id, q.rowVersion);
  }
}
