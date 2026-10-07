import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import { ShopProfileSaveSchema, type ShopProfileSave } from '../../../../../shared/distribution/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { RoutesService } from '../application/routes.service.js';

const uuid = new ParseUUIDPipe();

/** /api/distribution/shop-profiles: the shop assignment board (which route, area, visit order and price tier a shop has). */
@Controller('distribution/shop-profiles')
export class ShopProfilesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  @RequirePermission('route:view')
  list(@CurrentUser() user: SessionUser) {
    return this.routes.profiles(user);
  }

  /** Up to 50 customers not on any route (search by name, code, area or city). */
  @Get('unassigned')
  @RequirePermission('route:view')
  unassigned(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ search: z.string().trim().max(100).optional() }))) q: { search?: string }) {
    return this.routes.unassigned(user, q.search);
  }

  @Put(':customerId')
  @RequirePermission('route:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('customerId', uuid) customerId: string, @Body(new ZodValidationPipe(ShopProfileSaveSchema)) body: ShopProfileSave) {
    return this.routes.saveProfile(user, meta, customerId, body);
  }

  @Delete(':customerId')
  @HttpCode(204)
  @RequirePermission('route:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('customerId', uuid) customerId: string, @Query(new ZodValidationPipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.routes.removeProfile(user, meta, customerId, q.rowVersion);
  }
}
