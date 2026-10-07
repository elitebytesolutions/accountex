import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ProductCompanyCreateSchema,
  ProductCompanyUpdateSchema,
  RowVersionSchema,
  type ProductCompanyCreate,
  type ProductCompanyUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CompaniesService } from '../application/companies.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/companies: Inventory › Products › Companies & Brands. */
@Controller('inventory/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser) {
    return this.companies.list(user);
  }

  @Get('next-code')
  @RequirePermission('item:view')
  async nextCode(@CurrentUser() user: SessionUser) {
    return { code: await this.companies.nextCode(user) };
  }

  @Post()
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ProductCompanyCreateSchema)) body: ProductCompanyCreate) {
    return this.companies.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ProductCompanyUpdateSchema)) body: ProductCompanyUpdate) {
    return this.companies.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('item:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.companies.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.companies.delete(user, meta, id, q.rowVersion);
  }
}
