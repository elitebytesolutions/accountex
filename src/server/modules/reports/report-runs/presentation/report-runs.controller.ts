import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ReportRunQuerySchema, ReportRunSchema, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ReportRunsService } from '../application/report-runs.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/reports/saved/:id/run and /api/reports/runs: Reports Centre › run history and downloads. */
@Controller('reports')
export class ReportRunsController {
  constructor(private readonly runs: ReportRunsService) {}

  @Post('saved/:id/run')
  @RequirePermission('rpt:view')
  run(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(ReportRunSchema)) body: { format: string }) {
    return this.runs.run(user, meta, id, body.format);
  }

  @Get('runs')
  @RequirePermission('rpt:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(ReportRunQuerySchema)) q: { report?: string; mine?: boolean; page: number; pageSize: number }) {
    return this.runs.list(user, q);
  }

  @Get('runs/:id/download')
  @RequirePermission('rpt:view')
  async download(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res() res: Response) {
    const f = await this.runs.download(user, id);
    res.setHeader('content-type', f.contentType);
    res.setHeader('content-disposition', `attachment; filename="${f.fileName.replace(/"/g, '')}"`);
    res.send(f.data);
  }
}
