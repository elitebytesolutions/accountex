import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema,
  VendorBankCreateSchema,
  VendorBankUpdateSchema,
  VendorContactCreateSchema,
  VendorContactUpdateSchema,
  VendorCreateSchema,
  VendorListQuerySchema,
  VendorUpdateSchema,
  type SessionUser,
  type VendorBankCreate,
  type VendorBankUpdate,
  type VendorContactCreate,
  type VendorContactUpdate,
  type VendorCreate,
  type VendorListQuery,
  type VendorUpdate,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { VendorsService } from '../application/vendors.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/purchases/vendors (+ contacts, bank accounts): Payables › Vendors. */
@Controller('purchases')
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('vendors')
  @RequirePermission('vend:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(VendorListQuerySchema)) q: VendorListQuery) {
    return this.vendors.list(user, q);
  }

  @Get('vendors/summary')
  @RequirePermission('vend:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.vendors.summary(user);
  }

  @Get('vendors/form-options')
  @RequirePermission('vend:view')
  formOptions(@CurrentUser() user: SessionUser) {
    return this.vendors.formOptions(user);
  }

  @Get('vendors/:id')
  @RequirePermission('vend:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.vendors.get(user, id);
  }

  @Post('vendors')
  @RequirePermission('vend:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(VendorCreateSchema)) body: VendorCreate) {
    return this.vendors.create(user, meta, body);
  }

  @Patch('vendors/:id')
  @RequirePermission('vend:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorUpdateSchema)) body: VendorUpdate) {
    return this.vendors.update(user, meta, id, body);
  }

  @Post('vendors/:id/contacts')
  @RequirePermission('vend:edit')
  addContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorContactCreateSchema)) body: VendorContactCreate) {
    return this.vendors.addContact(user, meta, id, body);
  }

  @Post('vendors/:id/bank-accounts')
  @RequirePermission('vend:edit')
  addBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorBankCreateSchema)) body: VendorBankCreate) {
    return this.vendors.addBank(user, meta, id, body);
  }

  @Post('vendors/:id/:action')
  @HttpCode(200)
  @RequirePermission('vend:edit')
  setActive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('action', pipe(z.enum(['activate', 'deactivate']))) action: 'activate' | 'deactivate', @Body(version) body: { rowVersion: number }) {
    return this.vendors.setActive(user, meta, id, action === 'activate', body.rowVersion);
  }

  @Delete('vendors/:id')
  @HttpCode(204)
  @RequirePermission('vend:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.vendors.delete(user, meta, id, q.rowVersion);
  }

  @Patch('vendor-contacts/:id')
  @RequirePermission('vend:edit')
  updateContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorContactUpdateSchema)) body: VendorContactUpdate) {
    return this.vendors.updateContact(user, meta, id, body);
  }

  @Delete('vendor-contacts/:id')
  @HttpCode(204)
  @RequirePermission('vend:edit')
  async deleteContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.vendors.deleteContact(user, meta, id, q.rowVersion);
  }

  @Patch('vendor-bank-accounts/:id')
  @RequirePermission('vend:edit')
  updateBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(VendorBankUpdateSchema)) body: VendorBankUpdate) {
    return this.vendors.updateBank(user, meta, id, body);
  }

  @Delete('vendor-bank-accounts/:id')
  @HttpCode(204)
  @RequirePermission('vend:edit')
  async deleteBank(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.vendors.deleteBank(user, meta, id, q.rowVersion);
  }
}
