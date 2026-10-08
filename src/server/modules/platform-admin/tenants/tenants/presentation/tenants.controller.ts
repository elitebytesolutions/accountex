import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  ImpersonationStartSchema, TenantContactInputSchema, TenantListQuerySchema, TenantModulesInputSchema, TenantNoteInputSchema, TenantOnboardSchema, TenantStatusInputSchema,
  TenantUpdateSchema,
  type AdminSession, type ImpersonationStart, type ImpersonationStartInput, type TenantAction, type TenantContactInput, type TenantListQuery, type TenantModulesInput, type TenantNoteInput,
  type TenantOnboard, type TenantStatusInput, type TenantUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { AUTH_COOKIE } from '../../../../../common/guards/jwt-auth.guard.js';
import { env } from '../../../../../infrastructure/config/env.js';
import { ImpersonationService } from '../../impersonation/application/impersonation.service.js';
import { TenantsService } from '../application/tenants.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const action = pipe(z.enum(['suspend', 'reactivate', 'churn']));

/** /api/admin/tenants: Tenants › All Tenants, Onboard Tenant and Tenant 360 (Phase 40). */
@AdminRoute()
@Controller('admin/tenants')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly impersonation: ImpersonationService,
  ) {}

  @Get()
  list(@Query(pipe(TenantListQuerySchema)) q: TenantListQuery) {
    return this.tenants.list(q);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.tenants.get(id);
  }

  /** Onboard: Platform.provisionTenant, then details, owner contact, modules, subscription and seed lists (one transaction). */
  @Post()
  onboard(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(TenantOnboardSchema)) body: TenantOnboard) {
    return this.tenants.onboard(admin, meta, body);
  }

  @Patch(':id')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantUpdateSchema)) body: TenantUpdate) {
    return this.tenants.update(admin, meta, id, body);
  }

  @Put(':id/modules')
  modules(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantModulesInputSchema)) body: TenantModulesInput) {
    return this.tenants.setModules(admin, meta, id, body);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  contact(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantContactInputSchema)) body: TenantContactInput) {
    return this.tenants.addContact(admin, meta, id, body);
  }

  @Post(':id/notes')
  @HttpCode(200)
  note(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(TenantNoteInputSchema)) body: TenantNoteInput) {
    return this.tenants.addNote(admin, meta, id, body.body);
  }

  /**
   * Support access: starts a time-boxed session as one of the company's users and sets the workspace cookie, so the
   * Super Admin's browser opens the company at openUrl. Declared before ':id/:action'.
   */
  @Post(':id/impersonate')
  async impersonate(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Body(pipe(ImpersonationStartSchema)) body: ImpersonationStartInput, @Res({ passthrough: true }) res: Response,
  ): Promise<ImpersonationStart> {
    const { session, token, expiresAt } = await this.impersonation.start(admin, meta, id, body);
    res.cookie(AUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/', expires: expiresAt });
    return { session, openUrl: '/dashboard' };
  }

  @Post(':id/:action')
  @HttpCode(200)
  status(
    @CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string,
    @Param('action', action) act: TenantAction, @Body(pipe(TenantStatusInputSchema)) body: TenantStatusInput,
  ) {
    return this.tenants.setStatus(admin, meta, id, act, body);
  }
}
