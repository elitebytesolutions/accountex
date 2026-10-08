import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CatalogueStatusInputSchema, AddonCreateSchema, AddonPlansInputSchema, AddonUpdateSchema, RowVersionSchema,
  type AdminSession, type CatalogueStatusInput, type AddonCreate, type AddonPlansInput, type AddonUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { AddonsService } from '../application/addons.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/addons: add-ons sold on top of a plan (Plan Entitlements › Add-ons). */
@AdminRoute()
@Controller('admin/addons')
export class AddonsController {
  constructor(private readonly addons: AddonsService) {}

  @Get()
  list() {
    return this.addons.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.addons.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(AddonCreateSchema)) body: AddonCreate) {
    return this.addons.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AddonUpdateSchema)) body: AddonUpdate) {
    return this.addons.update(admin, meta, id, body);
  }

  @Put(':id/plans')
  plans(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(AddonPlansInputSchema)) body: AddonPlansInput) {
    return this.addons.setPlans(admin, meta, id, body);
  }

  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CatalogueStatusInputSchema)) body: CatalogueStatusInput) {
    return this.addons.setActive(admin, meta, id, body.rowVersion, true);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CatalogueStatusInputSchema)) body: CatalogueStatusInput) {
    return this.addons.setActive(admin, meta, id, body.rowVersion, false);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.addons.delete(admin, meta, id, q.rowVersion);
  }
}
