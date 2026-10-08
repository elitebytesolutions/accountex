import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  PrivacyApproveSchema, PrivacyFulfilSchema, PrivacyRejectSchema, PrivacyRequestCreateSchema,
  type AdminSession, type PrivacyApprove, type PrivacyFulfil, type PrivacyReject, type PrivacyRequestCreate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { PrivacyService } from '../application/privacy.service.js';

const uuid = new ParseUUIDPipe();

/** /api/admin/privacy-requests: Security & Privacy › Privacy requests (Phase 43). */
@AdminRoute()
@Controller('admin/privacy-requests')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  list() {
    return this.privacy.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.privacy.get(id);
  }

  /** { tenantId, requestType: EXPORT | DELETE, requestedByName, requestedByRole?, requesterEmail?, receivedOn? } */
  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(PrivacyRequestCreateSchema)) body: PrivacyRequestCreate) {
    return this.privacy.create(admin, meta, body);
  }

  @Post(':id/verify')
  @HttpCode(200)
  verify(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.privacy.verify(admin, meta, id);
  }

  /** { note?, confirmCode? }: a deletion needs the typed company code (+ a note for a solo approval). */
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(PrivacyApproveSchema)) body: PrivacyApprove) {
    return this.privacy.approve(admin, meta, id, body);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(PrivacyRejectSchema)) body: PrivacyReject) {
    return this.privacy.reject(admin, meta, id, body.reason);
  }

  /** EXPORT: starts the tenant export. DELETE: { confirmCode } runs the irreversible anonymisation. */
  @Post(':id/fulfil')
  @HttpCode(200)
  fulfil(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(new ZodValidationPipe(PrivacyFulfilSchema)) body: PrivacyFulfil) {
    return this.privacy.fulfil(admin, meta, id, body.confirmCode);
  }

  /** The export file (JSON) while its 7-day link is valid; 410 PRIVACY_EXPORT_EXPIRED after. */
  @Get(':id/export')
  async export(@Param('id', uuid) id: string, @Res() res: Response) {
    const f = await this.privacy.exportFile(id);
    res.download(f.location, f.filename);
  }

  @Get(':id/certificate')
  certificate(@CurrentAdmin() admin: AdminSession, @Param('id', uuid) id: string) {
    return this.privacy.certificate(admin, id);
  }
}
