import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CustomerAddressCreateSchema,
  CustomerAddressUpdateSchema,
  CustomerContactCreateSchema,
  CustomerContactUpdateSchema,
  CustomerCreateSchema,
  CustomerListQuerySchema,
  CustomerNoteCreateSchema,
  CustomerStatusSchema,
  CustomerUpdateSchema,
  RowVersionSchema,
  type CustomerAddressCreate,
  type CustomerAddressUpdate,
  type CustomerContactCreate,
  type CustomerContactUpdate,
  type CustomerCreate,
  type CustomerListQuery,
  type CustomerNoteCreate,
  type CustomerStatusChange,
  type CustomerUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { CustomersService } from '../application/customers.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/sales/customers (+ contacts, addresses, notes): Receivables › Customers. */
@Controller('sales')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('customers')
  @RequirePermission('cust:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(CustomerListQuerySchema)) q: CustomerListQuery) {
    return this.customers.list(user, q);
  }

  @Get('customers/summary')
  @RequirePermission('cust:view')
  summary(@CurrentUser() user: SessionUser) {
    return this.customers.summary(user);
  }

  @Get('customers/form-options')
  @RequirePermission('cust:view')
  formOptions(@CurrentUser() user: SessionUser) {
    return this.customers.formOptions(user);
  }

  @Get('customers/:id')
  @RequirePermission('cust:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.customers.get(user, id);
  }

  @Post('customers')
  @RequirePermission('cust:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(CustomerCreateSchema)) body: CustomerCreate) {
    return this.customers.create(user, meta, body);
  }

  @Patch('customers/:id')
  @RequirePermission('cust:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerUpdateSchema)) body: CustomerUpdate) {
    return this.customers.update(user, meta, id, body);
  }

  @Post('customers/:id/status')
  @HttpCode(200)
  @RequirePermission('cust:edit')
  setStatus(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerStatusSchema)) body: CustomerStatusChange) {
    return this.customers.setStatus(user, meta, id, body);
  }

  @Delete('customers/:id')
  @HttpCode(204)
  @RequirePermission('cust:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.customers.delete(user, meta, id, q.rowVersion);
  }

  @Post('customers/:id/contacts')
  @RequirePermission('cust:edit')
  addContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerContactCreateSchema)) body: CustomerContactCreate) {
    return this.customers.addContact(user, meta, id, body);
  }

  @Patch('customer-contacts/:id')
  @RequirePermission('cust:edit')
  updateContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerContactUpdateSchema)) body: CustomerContactUpdate) {
    return this.customers.updateContact(user, meta, id, body);
  }

  @Delete('customer-contacts/:id')
  @HttpCode(204)
  @RequirePermission('cust:edit')
  async deleteContact(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.customers.deleteContact(user, meta, id, q.rowVersion);
  }

  @Post('customers/:id/addresses')
  @RequirePermission('cust:edit')
  addAddress(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerAddressCreateSchema)) body: CustomerAddressCreate) {
    return this.customers.addAddress(user, meta, id, body);
  }

  @Patch('customer-addresses/:id')
  @RequirePermission('cust:edit')
  updateAddress(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerAddressUpdateSchema)) body: CustomerAddressUpdate) {
    return this.customers.updateAddress(user, meta, id, body);
  }

  @Delete('customer-addresses/:id')
  @HttpCode(204)
  @RequirePermission('cust:edit')
  async deleteAddress(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.customers.deleteAddress(user, meta, id, q.rowVersion);
  }

  @Post('customers/:id/notes')
  @RequirePermission('cust:edit')
  addNote(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CustomerNoteCreateSchema)) body: CustomerNoteCreate) {
    return this.customers.addNote(user, meta, id, body.note);
  }

  @Delete('customer-notes/:id')
  @HttpCode(204)
  @RequirePermission('cust:edit')
  async deleteNote(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.customers.deleteNote(user, meta, id, q.rowVersion);
  }
}
