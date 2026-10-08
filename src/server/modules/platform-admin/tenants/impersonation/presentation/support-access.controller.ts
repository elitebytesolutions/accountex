import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../../common/decorators/require-permission.decorator.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ImpersonationService } from '../application/impersonation.service.js';

/**
 * /api/me/support-access: the company's side of support access (Phase 40). `current` drives the workspace banner,
 * `end` closes the support session from inside the workspace, and the list is the company's support-access history.
 */
@Controller('me/support-access')
export class SupportAccessController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Get('current')
  current(@Req() req: Request & { sessionId?: string }) {
    return this.impersonation.current(req.sessionId);
  }

  @Post('end')
  @HttpCode(204)
  async end(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    await this.impersonation.endCurrent(user, meta);
  }

  @Get()
  @RequirePermission('aud:view')
  history(@CurrentUser() user: SessionUser) {
    return this.impersonation.history(user.tenantId);
  }
}
