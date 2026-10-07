import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  AssetCategoryCreateSchema,
  AssetCategoryUpdateSchema,
  RowVersionSchema,
  type AssetCategoryCreate,
  type AssetCategoryUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { AssetCategoriesService } from '../application/asset-categories.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/assets/categories: Fixed Assets › Asset Categories. */
@Controller('assets/categories')
export class AssetCategoriesController {
  constructor(private readonly categories: AssetCategoriesService) {}

  @Get()
  @RequirePermission('fa:view')
  list(@CurrentUser() user: SessionUser) {
    return this.categories.list(user);
  }

  @Post()
  @RequirePermission('fa:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(AssetCategoryCreateSchema)) body: AssetCategoryCreate) {
    return this.categories.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('fa:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(AssetCategoryUpdateSchema)) body: AssetCategoryUpdate) {
    return this.categories.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('fa:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.categories.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('fa:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.categories.delete(user, meta, id, q.rowVersion);
  }
}
