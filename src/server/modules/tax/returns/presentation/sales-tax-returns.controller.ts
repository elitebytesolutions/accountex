import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  RowVersionSchema, SalesTaxReturnPaySchema, SalesTaxReturnPrepareSchema, SalesTaxReturnQuerySchema, SalesTaxReturnUpdateSchema,
  type SalesTaxReturnPay, type SalesTaxReturnPrepare, type SalesTaxReturnQuery, type SalesTaxReturnUpdate, type SessionUser,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SalesTaxReturnsService } from '../application/sales-tax-returns.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const uuid = new ParseUUIDPipe();

/** /api/tax: options for the tax pages (bank accounts, WHT sections, parties). */
@Controller('tax/options')
export class TaxOptionsController {
  constructor(private readonly returns: SalesTaxReturnsService) {}

  @Get()
  @RequirePermission('tax:view')
  options(@CurrentUser() user: SessionUser) {
    return this.returns.options(user);
  }
}

/** /api/tax/sales-tax-returns: Tax & Compliance › Sales Tax Return. */
@Controller('tax/sales-tax-returns')
export class SalesTaxReturnsController {
  constructor(private readonly returns: SalesTaxReturnsService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(SalesTaxReturnQuerySchema)) q: SalesTaxReturnQuery) {
    return this.returns.list(user, q);
  }

  @Post('prepare')
  @HttpCode(200)
  @RequirePermission('tax:create')
  prepare(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(SalesTaxReturnPrepareSchema)) body: SalesTaxReturnPrepare) {
    return this.returns.prepare(user, meta, body);
  }

  @Get(':id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.returns.get(user, id);
  }

  @Patch(':id')
  @RequirePermission('tax:edit')
  update(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesTaxReturnUpdateSchema)) body: SalesTaxReturnUpdate) {
    return this.returns.update(user, meta, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tax:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.returns.remove(user, meta, id, q.rowVersion);
  }

  /** Validate: DRAFT → VALIDATED. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('tax:approve')
  validate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.returns.validate(user, meta, id, body.rowVersion);
  }

  @Post(':id/file')
  @HttpCode(200)
  @RequirePermission('tax:post')
  file(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.returns.file(user, meta, id, body.rowVersion);
  }

  @Post(':id/pay')
  @HttpCode(200)
  @RequirePermission('tax:post')
  pay(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesTaxReturnPaySchema)) body: SalesTaxReturnPay) {
    return this.returns.pay(user, meta, id, body);
  }

  @Get(':id/annex-c.csv')
  @RequirePermission('tax:export')
  annexC(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res({ passthrough: true }) res: Response) {
    return this.download(user, id, 'C', res);
  }

  @Get(':id/annex-a.csv')
  @RequirePermission('tax:export')
  annexA(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string, @Res({ passthrough: true }) res: Response) {
    return this.download(user, id, 'A', res);
  }

  private async download(user: SessionUser, id: string, annex: 'A' | 'C', res: Response) {
    const f = await this.returns.annexCsv(user, id, annex);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(Buffer.from(`﻿${f.body}`, 'utf8'));
  }
}
