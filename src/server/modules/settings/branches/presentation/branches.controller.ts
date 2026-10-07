import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  BranchActionSchema,
  BranchCreateSchema,
  BranchUpdateSchema,
  ListQuerySchema,
  type Branch,
  type BranchAction,
  type BranchCreate,
  type BranchUpdate,
  type ListQuery,
  type ListResult,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BranchesService } from '../application/branches.service.js';

/** /api/settings/branches: Settings › Branches tab. */
@Controller('settings/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermission('comp:view')
  list(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(ListQuerySchema)) query: ListQuery): Promise<ListResult<Branch>> {
    return this.branches.list(user, query);
  }

  /** Active branches as select options for any signed-in user (masters such as bank and cash accounts pick a branch). */
  @Get('options')
  async options(@CurrentUser() user: SessionUser) {
    const { items } = await this.branches.list(user, { page: 1, pageSize: 100 } as ListQuery);
    return items.filter((b) => b.status === 'ACTIVE').map((b) => ({ id: b.id, code: b.code, name: b.name }));
  }

  @Get(':id')
  @RequirePermission('comp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', new ParseUUIDPipe()) id: string): Promise<Branch> {
    return this.branches.get(user, id);
  }

  @Post()
  @RequirePermission('comp:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(BranchCreateSchema)) body: BranchCreate) {
    return this.branches.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('comp:edit')
  update(
    @CurrentUser() user: SessionUser,
    @ReqMeta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(BranchUpdateSchema)) body: BranchUpdate,
  ) {
    return this.branches.update(user, meta, id, body);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  deactivate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(BranchActionSchema)) body: BranchAction) {
    return this.branches.setStatus(user, meta, id, 'INACTIVE', body.rowVersion);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  activate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(BranchActionSchema)) body: BranchAction) {
    return this.branches.setStatus(user, meta, id, 'ACTIVE', body.rowVersion);
  }

  @Post(':id/make-default')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  makeDefault(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(BranchActionSchema)) body: BranchAction) {
    return this.branches.makeDefault(user, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('comp:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string, @Query(new ZodValidationPipe(BranchActionSchema)) query: BranchAction) {
    await this.branches.delete(user, meta, id, query.rowVersion);
  }
}
