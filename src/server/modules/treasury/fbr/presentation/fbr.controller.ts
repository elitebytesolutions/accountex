import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { FBR_AUTHORITIES, FbrSettingSaveSchema, type FbrAuthority, type FbrSettingSave, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { FbrService } from '../application/fbr.service.js';

/** /api/tax/fbr: Tax & Compliance › FBR Integration (settings). The token is write-only. */
@Controller('tax/fbr')
export class FbrController {
  constructor(private readonly fbr: FbrService) {}

  @Get()
  @RequirePermission('tax:view')
  get(@CurrentUser() user: SessionUser) {
    return this.fbr.get(user);
  }

  @Put(':authority')
  @RequirePermission('tax:edit')
  save(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('authority', new ZodValidationPipe(z.enum(FBR_AUTHORITIES))) authority: FbrAuthority, @Body(new ZodValidationPipe(FbrSettingSaveSchema)) body: FbrSettingSave) {
    return this.fbr.save(user, meta, authority, body);
  }
}
