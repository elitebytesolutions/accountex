import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { RowVersionSchema, type SessionUser } from '../../../../../shared/index.js';
import {
  ReportPreviewRequestSchema, ReportScheduleCreateSchema, ReportScheduleUpdateSchema, SavedReportColumnsSchema, SavedReportCreateSchema, SavedReportSharesSchema,
  SavedReportUpdateSchema, type ReportPreviewRequest, type ReportScheduleCreate, type ReportScheduleUpdate, type SavedReportCreate, type SavedReportUpdate,
} from '../../../../../shared/reports/saved-report.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReportPreviewService } from '../application/report-preview.service.js';
import { SavedReportsService } from '../application/saved-reports.service.js';

const uuid = new ParseUUIDPipe();
const version = new ZodValidationPipe(RowVersionSchema);
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/**
 * /api/reports: Analytics › Report Studio. Saved definitions need rpt:* plus ownership or an editing share; a preview
 * also needs the data source's own view permission (REPORT_SOURCE_FORBIDDEN).
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: SavedReportsService,
    private readonly previews: ReportPreviewService,
  ) {}

  @Get('options')
  @RequirePermission('rpt:view')
  options(@CurrentUser() user: SessionUser) {
    return this.previews.options(user);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('rpt:view')
  preview(@CurrentUser() user: SessionUser, @Body(pipe(ReportPreviewRequestSchema)) body: ReportPreviewRequest) {
    return this.previews.preview(user, body);
  }

  @Get('saved')
  @RequirePermission('rpt:view')
  list(@CurrentUser() user: SessionUser) {
    return this.reports.list(user);
  }

  @Get('saved/:id')
  @RequirePermission('rpt:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.reports.get(user, id);
  }

  @Post('saved')
  @RequirePermission('rpt:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SavedReportCreateSchema)) body: SavedReportCreate) {
    return this.reports.create(user, meta, body);
  }

  @Patch('saved/:id')
  @RequirePermission('rpt:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SavedReportUpdateSchema)) body: SavedReportUpdate) {
    return this.reports.update(user, meta, id, body);
  }

  @Put('saved/:id/columns')
  @RequirePermission('rpt:edit')
  columns(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SavedReportColumnsSchema)) body: z.infer<typeof SavedReportColumnsSchema>) {
    return this.reports.setColumns(user, meta, id, body.rowVersion, body.columns);
  }

  @Put('saved/:id/shares')
  @RequirePermission('rpt:edit')
  shares(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SavedReportSharesSchema)) body: z.infer<typeof SavedReportSharesSchema>) {
    return this.reports.setShares(user, meta, id, body.rowVersion, body.visibility, body.shares);
  }

  @Delete('saved/:id')
  @HttpCode(204)
  @RequirePermission('rpt:delete')
  async delete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(version) q: { rowVersion: number }) {
    await this.reports.delete(user, meta, id, q.rowVersion);
  }

  @Post('saved/:id/schedules')
  @RequirePermission('rpt:edit')
  createSchedule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReportScheduleCreateSchema)) body: ReportScheduleCreate) {
    return this.reports.createSchedule(user, meta, id, body);
  }

  @Patch('saved/:id/schedules/:scheduleId')
  @RequirePermission('rpt:edit')
  updateSchedule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('scheduleId', uuid) scheduleId: string, @Body(pipe(ReportScheduleUpdateSchema)) body: ReportScheduleUpdate) {
    return this.reports.updateSchedule(user, meta, id, scheduleId, body);
  }

  @Delete('saved/:id/schedules/:scheduleId')
  @RequirePermission('rpt:edit')
  deleteSchedule(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('scheduleId', uuid) scheduleId: string, @Query(version) q: { rowVersion: number }) {
    return this.reports.deleteSchedule(user, meta, id, scheduleId, q.rowVersion);
  }
}
