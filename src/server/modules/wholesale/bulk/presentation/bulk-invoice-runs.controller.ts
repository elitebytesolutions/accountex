import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { BulkRunInputSchema, WholesaleQuerySchema, type BulkRunInput, type SessionUser, type WholesaleQuery } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { BulkInvoiceRunsService } from '../application/bulk-invoice-runs.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/distribution/bulk-invoice-runs: Wholesale › Bulk Invoicing. */
@Controller('distribution/bulk-invoice-runs')
export class BulkInvoiceRunsController {
  constructor(private readonly runs: BulkInvoiceRunsService) {}

  @Get()
  @RequirePermission('bulkinv:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(WholesaleQuerySchema)) q: WholesaleQuery) {
    return this.runs.list(user, q);
  }

  @Get(':id')
  @RequirePermission('bulkinv:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.runs.get(user, id);
  }

  @Post()
  @RequirePermission('bulkinv:create')
  create(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(BulkRunInputSchema)) body: BulkRunInput) {
    return this.runs.create(user, meta, body);
  }

  @Post(':id/preview')
  @HttpCode(200)
  @RequirePermission('bulkinv:view')
  preview(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.runs.preview(user, id);
  }

  /** Generates and posts one wholesale invoice per shop; skipped shops are recorded. */
  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('bulkinv:post')
  post(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.runs.generate(user, meta, id);
  }
}
