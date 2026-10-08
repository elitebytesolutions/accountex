import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import {
  AllowedIpCreateSchema, SecuritySettingsUpdateSchema,
  type AdminSession, type AllowedIpCreate, type SecuritySettingsUpdate,
} from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { SecurityService } from '../application/security.service.js';

const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/admin/security: console sign-in policies and the IP allow-list (System › Security & Privacy). */
@AdminRoute()
@Controller('admin/security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  /** The settings, plus the caller's IP and whether the active allow-list contains it. */
  @Get('settings')
  settings(@ReqMeta() meta: RequestMeta) {
    return this.security.settings(meta);
  }

  /** 409 SECURITY_SELF_LOCKOUT when the change would lock the caller out. */
  @Put('settings')
  update(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(SecuritySettingsUpdateSchema)) body: SecuritySettingsUpdate) {
    return this.security.updateSettings(admin, meta, body);
  }

  @Get('allowed-ips')
  allowedIps() {
    return this.security.allowedIps();
  }

  @Post('allowed-ips')
  addAllowedIp(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(AllowedIpCreateSchema)) body: AllowedIpCreate) {
    return this.security.addAllowedIp(admin, meta, body);
  }

  @Delete('allowed-ips/:id')
  @HttpCode(204)
  async removeAllowedIp(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.security.removeAllowedIp(admin, meta, id);
  }
}
