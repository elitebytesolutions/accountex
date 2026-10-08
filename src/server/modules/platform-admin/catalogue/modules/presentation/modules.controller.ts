import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CatalogueStatusInputSchema, ModuleCreateSchema, ModulePlansInputSchema, ModuleUpdateSchema, RowVersionSchema,
  type AdminSession, type CatalogueStatusInput, type ModuleCreate, type ModulePlansInput, type ModuleUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ModulesService } from '../application/modules.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/modules: platform modules and their per-plan inclusion (Plan Entitlements, Modules by plan). */
@AdminRoute()
@Controller('admin/modules')
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Get()
  list() {
    return this.modules.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.modules.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(ModuleCreateSchema)) body: ModuleCreate) {
    return this.modules.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ModuleUpdateSchema)) body: ModuleUpdate) {
    return this.modules.update(admin, meta, id, body);
  }

  @Put(':id/plans')
  plans(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ModulePlansInputSchema)) body: ModulePlansInput) {
    return this.modules.setPlans(admin, meta, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CatalogueStatusInputSchema)) body: CatalogueStatusInput) {
    return this.modules.setEnabled(admin, meta, id, body.rowVersion, true);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CatalogueStatusInputSchema)) body: CatalogueStatusInput) {
    return this.modules.setEnabled(admin, meta, id, body.rowVersion, false);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.modules.delete(admin, meta, id, q.rowVersion);
  }
}
