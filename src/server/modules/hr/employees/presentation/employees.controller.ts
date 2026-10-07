import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  BankAccountsSchema, ConfirmSchema, DocumentsSchema, EmployeeCreateSchema, EmployeeListQuerySchema, EmployeeUpdateSchema, ExitSchema, LinkUserSchema, PositionChangeSchema,
  RejoinSchema, RowVersionSchema, StatusChangeSchema, StatutoryUpdateSchema,
  type EmployeeCreate, type EmployeeListQuery, type EmployeeUpdate, type PositionChange, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { EmployeesService } from '../application/employees.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
type In<T extends z.ZodType> = z.infer<T>;

/** /api/hr/employees: Workforce › People › Employees. Position changes and status events write position history. */
@Controller('hr/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(EmployeeListQuerySchema)) q: EmployeeListQuery) {
    return this.employees.page(user, q);
  }

  @Get('options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.employees.options(user);
  }

  @Get(':id')
  @RequirePermission('emp:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.employees.get(user, id);
  }

  @Post()
  @RequirePermission('emp:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(EmployeeCreateSchema)) body: EmployeeCreate) {
    return this.employees.create(user, meta, body);
  }

  @Patch(':id')
  @RequirePermission('emp:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(EmployeeUpdateSchema)) body: EmployeeUpdate) {
    return this.employees.update(user, meta, id, body);
  }

  @Post(':id/position')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  position(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PositionChangeSchema)) body: PositionChange) {
    return this.employees.changePosition(user, meta, id, body);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  confirm(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ConfirmSchema)) body: In<typeof ConfirmSchema>) {
    return this.employees.confirm(user, meta, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  status(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(StatusChangeSchema)) body: In<typeof StatusChangeSchema>) {
    return this.employees.setStatus(user, meta, id, body);
  }

  @Post(':id/exit')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  exit(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ExitSchema)) body: In<typeof ExitSchema>) {
    return this.employees.exit(user, meta, id, body);
  }

  @Post(':id/rejoin')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  rejoin(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RejoinSchema)) body: In<typeof RejoinSchema>) {
    return this.employees.rejoin(user, meta, id, body);
  }

  @Post(':id/link-user')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  link(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LinkUserSchema)) body: In<typeof LinkUserSchema>) {
    return this.employees.linkUser(user, meta, id, body);
  }

  @Put(':id/bank-accounts')
  @RequirePermission('emp:edit')
  banks(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(BankAccountsSchema)) body: In<typeof BankAccountsSchema>) {
    return this.employees.setBankAccounts(user, meta, id, body);
  }

  @Put(':id/documents')
  @RequirePermission('emp:edit')
  documents(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(DocumentsSchema)) body: In<typeof DocumentsSchema>) {
    return this.employees.setDocuments(user, meta, id, body);
  }

  @Put(':id/statutory')
  @RequirePermission('emp:edit')
  statutory(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(StatutoryUpdateSchema)) body: In<typeof StatutoryUpdateSchema>) {
    return this.employees.setStatutory(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('emp:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.employees.delete(user, meta, id, q.rowVersion);
  }
}
