import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  HistoryQuerySchema, RowVersionSchema, SalarySlabsSaveSchema, SalesTaxRateUpdateSchema, SalesTaxScheduleSchema, TaxAuthorityUpdateSchema,
  TaxMasterPublishSchema, TaxYearParamSchema, WithholdingRateUpdateSchema, WithholdingScheduleSchema,
  type AdminSession, type HistoryQuery, type SalarySlabsSave, type SalesTaxRateUpdate, type SalesTaxSchedule, type TaxAuthorityUpdate,
  type TaxMasterPublish, type WithholdingRateUpdate, type WithholdingSchedule,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { TaxMasterService } from '../application/tax-master.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/**
 * /api/admin/tax-master: Operations › System › Tax Master (sales tax, withholding, section 149 slabs, FBR / PRAL
 * connection, change log, publish to tenants).
 */
@AdminRoute()
@Controller('admin/tax-master')
export class TaxMasterController {
  constructor(private readonly tax: TaxMasterService) {}

  @Get()
  get() {
    return this.tax.get();
  }

  @Get('log')
  log(@Query(pipe(HistoryQuerySchema)) query: HistoryQuery) {
    return this.tax.log(query);
  }

  @Post('sales-tax')
  scheduleSalesTax(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(SalesTaxScheduleSchema)) body: SalesTaxSchedule) {
    return this.tax.scheduleSalesTax(admin, meta, body);
  }

  @Patch('sales-tax/:id')
  updateSalesTax(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(SalesTaxRateUpdateSchema)) body: SalesTaxRateUpdate) {
    return this.tax.updateRate(admin, meta, 'sales-tax', id, body);
  }

  @Delete('sales-tax/:id')
  @HttpCode(204)
  async cancelSalesTax(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.tax.cancelRate(admin, meta, 'sales-tax', id, q.rowVersion);
  }

  @Post('withholding')
  scheduleWithholding(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(WithholdingScheduleSchema)) body: WithholdingSchedule) {
    return this.tax.scheduleWithholding(admin, meta, body);
  }

  @Patch('withholding/:id')
  updateWithholding(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(WithholdingRateUpdateSchema)) body: WithholdingRateUpdate) {
    return this.tax.updateRate(admin, meta, 'withholding', id, body);
  }

  @Delete('withholding/:id')
  @HttpCode(204)
  async cancelWithholding(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Query(pipe(RowVersionSchema)) q: { rowVersion: number }) {
    await this.tax.cancelRate(admin, meta, 'withholding', id, q.rowVersion);
  }

  @Put('salary-slabs/:taxYear')
  saveSlabs(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('taxYear', pipe(TaxYearParamSchema)) taxYear: number, @Body(pipe(SalarySlabsSaveSchema)) body: SalarySlabsSave) {
    return this.tax.saveSlabs(admin, meta, taxYear, body);
  }

  @Patch('authorities/:id')
  updateAuthority(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TaxAuthorityUpdateSchema)) body: TaxAuthorityUpdate) {
    return this.tax.updateAuthority(admin, meta, id, body);
  }

  @Post('authorities/:id/test')
  @HttpCode(200)
  test(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.tax.testConnection(admin, meta, id);
  }

  @Post('publish')
  @HttpCode(200)
  publish(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(TaxMasterPublishSchema)) body: TaxMasterPublish) {
    return this.tax.publish(admin, meta, body);
  }
}
