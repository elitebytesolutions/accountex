import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { FlagSdkKeyCreateSchema, type AdminSession, type FlagSdkKeyCreate } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SdkKeysService } from '../application/sdk-keys.service.js';

/** /api/admin/flags/sdk-keys: the SDK keys tab. Secrets are returned once (create / rotate). */
@AdminRoute()
@Controller('admin/flags/sdk-keys')
export class SdkKeysController {
  constructor(private readonly keys: SdkKeysService) {}

  /** ?all=true includes revoked keys. */
  @Get()
  list(@Query('all') all?: string) {
    return this.keys.list(all === 'true');
  }

  @Post()
  create(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(FlagSdkKeyCreateSchema)) body: FlagSdkKeyCreate) {
    return this.keys.create(admin, meta, body);
  }

  @Post(':id/rotate')
  rotate(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.keys.rotate(admin, meta, id);
  }

  @Post(':id/revoke')
  revoke(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.keys.revoke(admin, meta, id);
  }
}
