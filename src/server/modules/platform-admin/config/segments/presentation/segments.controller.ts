import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, SegmentCreateSchema, SegmentOverridesInputSchema, SegmentPreviewSchema, SegmentRulesInputSchema, SegmentUpdateSchema,
  type AdminSession, type SegmentCreate, type SegmentOverridesInput, type SegmentPreview, type SegmentRulesInput, type SegmentUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { SegmentsService } from '../application/segments.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/segments: tenant segments (Feature Management › Segments). */
@AdminRoute()
@Controller('admin/segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  list() {
    return this.segments.list();
  }

  /** Values the rule builder offers (plans, regions, industries, cities, platforms) and the tenants for overrides. */
  @Get('options')
  options() {
    return this.segments.options();
  }

  /** Evaluates unsaved rules (live count while editing). */
  @Post('preview')
  @HttpCode(200)
  preview(@Body(pipe(SegmentPreviewSchema)) body: SegmentPreview) {
    return this.segments.preview(body);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.segments.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(SegmentCreateSchema)) body: SegmentCreate) {
    return this.segments.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SegmentUpdateSchema)) body: SegmentUpdate) {
    return this.segments.update(admin, meta, id, body);
  }

  @Put(':id/rules')
  rules(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SegmentRulesInputSchema)) body: SegmentRulesInput) {
    return this.segments.replaceRules(admin, meta, id, body.rules, body.rowVersion);
  }

  @Put(':id/tenants')
  tenants(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SegmentOverridesInputSchema)) body: SegmentOverridesInput) {
    return this.segments.replaceOverrides(admin, meta, id, body.overrides, body.rowVersion);
  }

  /** The matching tenants and the plan breakdown of the saved segment. */
  @Post(':id/evaluate')
  @HttpCode(200)
  evaluate(@Param('id', uuid) id: string) {
    return this.segments.evaluate(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.segments.delete(admin, meta, id, q.rowVersion);
  }
}
