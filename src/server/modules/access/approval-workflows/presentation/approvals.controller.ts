import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  DelegationSaveSchema,
  DelegationUpdateSchema,
  RowVersionSchema,
  WorkflowDryRunSchema,
  WorkflowSaveSchema,
  WorkflowUpdateSchema,
  type DelegationSave,
  type DelegationUpdate,
  type SessionUser,
  type WorkflowDryRun,
  type WorkflowSave,
  type WorkflowUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ApprovalsService } from '../application/approvals.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/settings/approval-workflows and /api/settings/approval-delegations: Settings › Approval Workflows. */
@Controller('settings')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('approval-workflows')
  @RequirePermission('wf:view')
  list(@CurrentUser() user: SessionUser) {
    return this.approvals.list(user);
  }

  @Get('approval-workflows/approvers')
  @RequirePermission('wf:view')
  approvers(@CurrentUser() user: SessionUser) {
    return this.approvals.approvers(user);
  }

  @Get('approval-workflows/:id')
  @RequirePermission('wf:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.approvals.get(user, id);
  }

  @Post('approval-workflows')
  @RequirePermission('wf:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(WorkflowSaveSchema)) body: WorkflowSave) {
    return this.approvals.create(user, meta, body);
  }

  @Patch('approval-workflows/:id')
  @RequirePermission('wf:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(WorkflowUpdateSchema)) body: WorkflowUpdate) {
    return this.approvals.update(user, meta, id, body);
  }

  @Post('approval-workflows/:id/publish')
  @HttpCode(200)
  @RequirePermission('wf:edit')
  publish(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.approvals.publish(user, meta, id, body.rowVersion);
  }

  @Post('approval-workflows/:id/deactivate')
  @HttpCode(200)
  @RequirePermission('wf:edit')
  deactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(version) body: { rowVersion: number }) {
    return this.approvals.deactivate(user, meta, id, body.rowVersion);
  }

  @Delete('approval-workflows/:id')
  @HttpCode(204)
  @RequirePermission('wf:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.approvals.delete(user, meta, id, q.rowVersion);
  }

  @Post('approval-workflows/:id/test')
  @HttpCode(200)
  @RequirePermission('wf:view')
  test(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(WorkflowDryRunSchema)) body: WorkflowDryRun) {
    return this.approvals.dryRun(user, id, body);
  }

  @Get('approval-delegations')
  @RequirePermission('wf:view')
  delegations(@CurrentUser() user: SessionUser) {
    return this.approvals.delegations(user);
  }

  @Post('approval-delegations')
  @RequirePermission('wf:edit')
  createDelegation(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(DelegationSaveSchema)) body: DelegationSave) {
    return this.approvals.createDelegation(user, meta, body);
  }

  @Patch('approval-delegations/:id')
  @RequirePermission('wf:edit')
  updateDelegation(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(DelegationUpdateSchema)) body: DelegationUpdate) {
    return this.approvals.updateDelegation(user, meta, id, body);
  }

  @Delete('approval-delegations/:id')
  @HttpCode(204)
  @RequirePermission('wf:edit')
  async deleteDelegation(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.approvals.deleteDelegation(user, meta, id, q.rowVersion);
  }
}
