import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ProductClassCreateSchema,
  ProductClassUpdateSchema,
  ProductSubclassCreateSchema,
  ProductSubclassUpdateSchema,
  RowVersionSchema,
  SubclassOrderSchema,
  type ProductClassCreate,
  type ProductClassUpdate,
  type ProductSubclassCreate,
  type ProductSubclassUpdate,
  type SessionUser,
  type SubclassOrder,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ClassesService } from '../application/classes.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);

/** /api/inventory/classes and /api/inventory/subclasses: Inventory › Products › Product Classes. */
@Controller('inventory')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get('classes')
  @RequirePermission('item:view')
  list(@CurrentUser() user: SessionUser) {
    return this.classes.list(user);
  }

  @Post('classes')
  @RequirePermission('item:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(ProductClassCreateSchema)) body: ProductClassCreate) {
    return this.classes.create(user, meta, body);
  }

  @Patch('classes/:id')
  @RequirePermission('item:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ProductClassUpdateSchema)) body: ProductClassUpdate) {
    return this.classes.update(user, meta, id, body);
  }

  @Delete('classes/:id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.classes.delete(user, meta, id, q.rowVersion);
  }

  @Post('classes/:id/subclasses')
  @RequirePermission('item:create')
  addSubclass(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ProductSubclassCreateSchema)) body: ProductSubclassCreate) {
    return this.classes.addSubclass(user, meta, id, body);
  }

  @Put('classes/:id/subclass-order')
  @RequirePermission('item:edit')
  reorder(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(SubclassOrderSchema)) body: SubclassOrder) {
    return this.classes.reorderSubclasses(user, meta, id, body.ids);
  }

  @Patch('subclasses/:id')
  @RequirePermission('item:edit')
  updateSubclass(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(ProductSubclassUpdateSchema)) body: ProductSubclassUpdate) {
    return this.classes.updateSubclass(user, meta, id, body);
  }

  @Delete('subclasses/:id')
  @HttpCode(204)
  @RequirePermission('item:delete')
  async deleteSubclass(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.classes.deleteSubclass(user, meta, id, q.rowVersion);
  }
}
