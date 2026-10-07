import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { SetupGuideService } from '../application/setup-guide.service.js';

/** /api/settings/setup-guide: Workspace › Setup Guide. */
@Controller('settings/setup-guide')
export class SetupGuideController {
  constructor(private readonly guide: SetupGuideService) {}

  @Get()
  @RequirePermission('comp:view')
  get(@CurrentUser() user: SessionUser) {
    return this.guide.get(user);
  }

  @Post(':step/complete')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  complete(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('step') step: string) {
    return this.guide.setDone(user, meta, step, true);
  }

  @Post(':step/reopen')
  @HttpCode(200)
  @RequirePermission('comp:edit')
  reopen(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('step') step: string) {
    return this.guide.setDone(user, meta, step, false);
  }
}
