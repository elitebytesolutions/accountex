import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema,
  VendorCategoryCreateSchema,
  VendorCategoryUpdateSchema,
  type SessionUser,
  type VendorCategoryCreate,
  type VendorCategoryUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { VendorCategoriesService } from '../application/vendor-categories.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/purchases/vendor-categories: the Categories drawer on Vendors. */
@Controller('purchases/vendor-categories')
export class VendorCategoriesController {
  constructor(private readonly categories: VendorCategoriesService) {}

  @Get()
  @RequirePermission('vend:view')
  list(@CurrentUser() user: SessionUser) {
    return this.categories.list(user);
  }

  @Post()
  @RequirePermission('vend:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(VendorCategoryCreateSchema)) body: VendorCategoryCreate) {
    return this.categories.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('vend:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(VendorCategoryUpdateSchema)) body: VendorCategoryUpdate) {
    return this.categories.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('vend:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.categories.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('vend:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.categories.delete(user, meta, id, q.rowVersion);
  }
}
