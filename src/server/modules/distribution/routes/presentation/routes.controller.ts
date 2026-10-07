import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  RouteAssignmentSchema, RouteCreateSchema, RouteStopsSaveSchema, RouteUpdateSchema,
  type RouteAssignment, type RouteCreate, type RouteStopsSave, type RouteUpdate,
} from '../../../../../shared/distribution/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RoutesService } from '../application/routes.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/distribution/routes: Wholesale › Routes & Salesmen (route:* permissions). */
@Controller('distribution/routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @RequirePermission('route:view')
  list(@CurrentUser() user: SessionUser) {
    return this.routes.list(user);
  }

  /** Warehouses, vans, price tiers and employees per seat role, for the route sheet and assignment. */
  @Get('options')
  @RequirePermission('route:view')
  options(@CurrentUser() user: SessionUser) {
    return this.routes.options(user);
  }

  @Post()
  @RequirePermission('route:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(RouteCreateSchema)) body: RouteCreate) {
    return this.routes.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('route:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RouteUpdateSchema)) body: RouteUpdate) {
    return this.routes.update(user, meta, id, body);
  }

  @Put(':id/stops')
  @RequirePermission('route:edit')
  stops(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RouteStopsSaveSchema)) body: RouteStopsSave) {
    return this.routes.saveStops(user, meta, id, body);
  }

  @Put(':id/assignment')
  @RequirePermission('route:edit')
  assign(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RouteAssignmentSchema)) body: RouteAssignment) {
    return this.routes.assign(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('route:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.routes.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('route:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.routes.delete(user, meta, id, q.rowVersion);
  }
}
