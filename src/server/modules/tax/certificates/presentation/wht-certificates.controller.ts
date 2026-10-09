import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  RowVersionSchema, WhtCertificateGenerateSchema, WhtCertificateQuerySchema, WhtCertificateReceiveSchema, WhtStatementFileSchema, WhtStatementPrepareSchema,
  type SessionUser, type WhtCertificateQuery, type WhtCertificateReceive, type WhtStatementPrepare,
} from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { WhtCertificatesService } from '../application/wht-certificates.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const uuid = new ParseUUIDPipe();
const CancelBody = z.object({ rowVersion: z.coerce.number().int().min(0), reason: z.string().trim().max(300).optional().nullable().transform((v) => v || null) });

/** /api/tax/wht/certificates: deduction certificates issued, and certificates received from customers. */
@Controller('tax/wht/certificates')
export class WhtCertificatesController {
  constructor(private readonly certs: WhtCertificatesService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser, @Query(pipe(WhtCertificateQuerySchema)) q: WhtCertificateQuery) {
    return this.certs.list(user, q);
  }

  @Post('generate')
  @HttpCode(200)
  @RequirePermission('tax:create')
  generate(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WhtCertificateGenerateSchema)) body: { periodFrom: string; periodTo: string }) {
    return this.certs.generate(user, meta, body.periodFrom, body.periodTo);
  }

  @Post('received')
  @RequirePermission('tax:create')
  receive(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WhtCertificateReceiveSchema)) body: WhtCertificateReceive) {
    return this.certs.receive(user, meta, body);
  }

  @Get(':id')
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.certs.get(user, id);
  }

  /** Data for the browser print view (no server PDF). */
  @Get(':id/print')
  @RequirePermission('tax:export')
  print(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.certs.print(user, id);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermission('tax:approve')
  issue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.certs.issue(user, meta, id, body.rowVersion);
  }

  @Post(':id/claim')
  @HttpCode(200)
  @RequirePermission('tax:approve')
  claim(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(RowVersionSchema)) body: { rowVersion: number }) {
    return this.certs.claim(user, meta, id, body.rowVersion);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('tax:approve')
  cancel(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(CancelBody)) body: { rowVersion: number; reason: string | null }) {
    return this.certs.cancel(user, meta, id, body.rowVersion, body.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('tax:edit')
  async remove(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.certs.remove(user, meta, id, q.rowVersion);
  }
}

/** /api/tax/wht/statements: quarterly u/s 165 and annual u/s 149 / 165 statements. */
@Controller('tax/wht/statements')
export class WhtStatementsController {
  constructor(private readonly certs: WhtCertificatesService) {}

  @Get()
  @RequirePermission('tax:view')
  list(@CurrentUser() user: SessionUser) {
    return this.certs.listStatements(user);
  }

  @Post('prepare')
  @HttpCode(200)
  @RequirePermission('tax:create')
  prepare(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Body(pipe(WhtStatementPrepareSchema)) body: WhtStatementPrepare) {
    return this.certs.prepareStatement(user, meta, body);
  }

  @Post(':id/file')
  @HttpCode(200)
  @RequirePermission('tax:post')
  file(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WhtStatementFileSchema)) body: { filedOn: string; irisReference: string; rowVersion: number }) {
    return this.certs.fileStatement(user, meta, id, body);
  }
}
