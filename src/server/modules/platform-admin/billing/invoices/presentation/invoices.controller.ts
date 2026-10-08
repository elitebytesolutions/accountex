import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  InvoiceActionSchema, InvoiceCreateSchema, InvoiceGenerateQuerySchema, InvoiceGenerateSchema, InvoiceListQuerySchema, InvoiceUpdateSchema, InvoiceVoidSchema,
  PaymentCreateSchema,
  type AdminSession, type InvoiceAction, type InvoiceCreate, type InvoiceGenerate, type InvoiceListQuery, type InvoiceUpdate, type InvoiceVoid, type PaymentCreate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { PaymentsService } from '../../payments/application/payments.service.js';
import { InvoicesService } from '../application/invoices.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/invoices: Billing › Platform Invoices (Phase 41). Issued invoices are immutable (void + new). */
@AdminRoute()
@Controller('admin/invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  list(@Query(pipe(InvoiceListQuerySchema)) q: InvoiceListQuery) {
    return this.invoices.list(q);
  }

  @Post('generate')
  @HttpCode(200)
  generate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Query(pipe(InvoiceGenerateQuerySchema)) q: { period?: string }, @Body(pipe(InvoiceGenerateSchema)) body: InvoiceGenerate) {
    return this.invoices.generate(admin, meta, q.period, body);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.invoices.get(id);
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(InvoiceCreateSchema)) body: InvoiceCreate) {
    return this.invoices.create(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(InvoiceUpdateSchema)) body: InvoiceUpdate) {
    return this.invoices.update(admin, meta, id, body);
  }

  @Post(':id/issue')
  @HttpCode(200)
  issue(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(InvoiceActionSchema)) body: InvoiceAction) {
    return this.invoices.issue(admin, meta, id, body.rowVersion);
  }

  @Post(':id/void')
  @HttpCode(200)
  void(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(InvoiceVoidSchema)) body: InvoiceVoid) {
    return this.invoices.void(admin, meta, id, body);
  }

  /** Records a payment (the database allocates it; a settled invoice in dunning recovers its case). */
  @Post(':id/payments')
  pay(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(PaymentCreateSchema)) body: PaymentCreate) {
    return this.payments.record(admin, meta, id, body);
  }
}
