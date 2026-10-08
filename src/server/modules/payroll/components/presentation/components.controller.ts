import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ComponentCreateSchema, ComponentUpdateSchema, RowVersionSchema, type ComponentCreate, type ComponentUpdate, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ComponentsService } from '../application/components.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/payroll/components and /api/payroll/options: Workforce › Payroll › Salary Structures (Components tab). */
@Controller('payroll')
export class ComponentsController {
  constructor(private readonly components: ComponentsService) {}

  @Get('options')
  @RequirePermission('prun:view')
  options(@CurrentUser() user: SessionUser) {
    return this.components.options(user);
  }

  @Get('components')
  @RequirePermission('prun:view')
  list(@CurrentUser() user: SessionUser) {
    return this.components.list(user);
  }

  @Post('components')
  @RequirePermission('prun:edit')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(ComponentCreateSchema)) body: ComponentCreate) {
    return this.components.create(user, meta, body);
  }

  @Patch('components/:id')
  @RequirePermission('prun:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ComponentUpdateSchema)) body: ComponentUpdate) {
    return this.components.update(user, meta, id, body);
  }

  @Post('components/:id/:action')
  @HttpCode(200)
  @RequirePermission('prun:edit')
  action(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.components.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('components/:id')
  @HttpCode(204)
  @RequirePermission('prun:edit')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.components.delete(user, meta, id, q.rowVersion);
  }
}
