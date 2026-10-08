import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  ResellerCreateSchema, ResellerRowVersionSchema, ResellerStatusInputSchema, ResellerUpdateSchema, RowVersionSchema,
  type AdminSession, type ResellerCreate, type ResellerStatusInput, type ResellerUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ResellersService } from '../application/resellers.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/resellers: the partner network (Partners & Coupons › Resellers). The IBAN is write-only. */
@AdminRoute()
@Controller('admin/resellers')
export class ResellersController {
  constructor(private readonly resellers: ResellersService) {}

  @Get()
  list() {
    return this.resellers.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.resellers.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(ResellerCreateSchema)) body: ResellerCreate) {
    return this.resellers.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ResellerUpdateSchema)) body: ResellerUpdate) {
    return this.resellers.update(admin, meta, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ResellerStatusInputSchema)) body: ResellerStatusInput) {
    return this.resellers.setStatus(admin, meta, id, body.status, body.rowVersion);
  }

  @Post(':id/invite-code')
  @HttpCode(200)
  inviteCode(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ResellerRowVersionSchema)) body: { rowVersion: number }) {
    return this.resellers.regenerateInviteCode(admin, meta, id, body.rowVersion);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.resellers.delete(admin, meta, id, q.rowVersion);
  }
}
