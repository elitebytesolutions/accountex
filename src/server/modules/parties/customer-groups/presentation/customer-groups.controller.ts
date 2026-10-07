import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CustomerGroupCreateSchema,
  CustomerGroupUpdateSchema,
  RowVersionSchema,
  type CustomerGroupCreate,
  type CustomerGroupUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CustomerGroupsService } from '../application/customer-groups.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/sales/customer-groups: the Groups drawer on Customers. */
@Controller('sales/customer-groups')
export class CustomerGroupsController {
  constructor(private readonly groups: CustomerGroupsService) {}

  @Get()
  @RequirePermission('cust:view')
  list(@CurrentUser() user: SessionUser) {
    return this.groups.list(user);
  }

  @Post()
  @RequirePermission('cust:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(CustomerGroupCreateSchema)) body: CustomerGroupCreate) {
    return this.groups.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('cust:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(CustomerGroupUpdateSchema)) body: CustomerGroupUpdate) {
    return this.groups.update(user, meta, id, body);
  }

  @Post(':id/:action')
  @HttpCode(200)
  @RequirePermission('cust:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', new ZodValidationPipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.groups.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cust:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.groups.delete(user, meta, id, q.rowVersion);
  }
}
