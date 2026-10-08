import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  LeadActivityInputSchema, LeadCreateSchema, LeadDeleteSchema, LeadListQuerySchema, LeadMoveSchema, LeadUpdateSchema, TenantOnboardSchema,
  type AdminSession, type LeadActivityInput, type LeadCreate, type LeadListQuery, type LeadMove, type LeadUpdate, type TenantOnboard,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { LeadsService } from '../application/leads.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/leads: Growth › Leads CRM (Phase 42). Delete is soft; convert onboards the company (Phase 40) and links it. */
@AdminRoute()
@Controller('admin/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  board(@Query(pipe(LeadListQuerySchema)) q: LeadListQuery) {
    return this.leads.board(q);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.leads.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(LeadCreateSchema)) body: LeadCreate) {
    return this.leads.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeadUpdateSchema)) body: LeadUpdate) {
    return this.leads.update(admin, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(LeadDeleteSchema)) q: { rowVersion: number }) {
    await this.leads.remove(admin, meta, id, q.rowVersion);
  }

  @Post(':id/move')
  @HttpCode(200)
  move(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeadMoveSchema)) body: LeadMove) {
    return this.leads.move(admin, meta, id, body);
  }

  @Post(':id/activities')
  @HttpCode(200)
  activity(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(LeadActivityInputSchema)) body: LeadActivityInput) {
    return this.leads.addActivity(admin, meta, id, body);
  }

  /** Body: the onboarding wizard's input (TenantOnboard). 409 LEAD_ALREADY_CONVERTED when the lead already has a company. */
  @Post(':id/convert')
  convert(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantOnboardSchema)) body: TenantOnboard) {
    return this.leads.convert(admin, meta, id, body);
  }
}
