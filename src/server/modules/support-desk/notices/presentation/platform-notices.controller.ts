import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { PlatformNoticesService } from '../application/platform-notices.service.js';

const uuid = new ParseUUIDPipe();
const mark = new ZodValidationPipe(z.enum(['view', 'click', 'dismiss']));

/** /api/me/platform-announcements: the workspace banner and notifications popover (Phase 42). Any signed-in user. */
@Controller('me/platform-announcements')
export class PlatformNoticesController {
  constructor(private readonly notices: PlatformNoticesService) {}

  @Get()
  feed(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.notices.feed(user, meta);
  }

  /** Marks every in-app platform message read. Declared before ':id/:what'. */
  @Post('messages/read')
  @HttpCode(200)
  read(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta) {
    return this.notices.readMessages(user, meta);
  }

  @Post(':id/:what')
  @HttpCode(204)
  async mark(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Param('what', mark) what: 'view' | 'click' | 'dismiss') {
    await this.notices.mark(user, meta, id, what);
  }
}
