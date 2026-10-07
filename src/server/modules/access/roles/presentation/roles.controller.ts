import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  RowVersionSchema,
  type RoleCreate,
  type RoleUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RolesService } from '../application/roles.service.js';

const uuid = new ParseUUIDPipe();

/** /api/settings/roles and /api/settings/permissions: Settings › Roles & Permissions. */
@Controller('settings')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermission('rol:view')
  catalogue() {
    return this.roles.catalogue();
  }

  @Get('roles')
  @RequirePermission('rol:view')
  list(@CurrentUser() user: SessionUser) {
    return this.roles.list(user);
  }

  @Get('roles/:id')
  @RequirePermission('rol:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.roles.get(user, id);
  }

  @Post('roles')
  @RequirePermission('rol:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(RoleCreateSchema)) body: RoleCreate) {
    return this.roles.create(user, meta, body);
  }

  @Patch('roles/:id')
  @RequirePermission('rol:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(RoleUpdateSchema)) body: RoleUpdate) {
    return this.roles.update(user, meta, id, body);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('rol:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.roles.delete(user, meta, id, q.rowVersion);
  }
}
