import { Controller, Get } from '@nestjs/common';
import type { MyFlags, SessionUser } from '../../../../shared/index.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { FlagEvaluationService } from '../../platform-admin/flags/application/flag-evaluation.service.js';

/** GET /api/me/flags: the signed-in tenant's evaluated PRODUCTION flags (key → variation). No permission needed. */
@Controller('me/flags')
export class MyFlagsController {
  constructor(private readonly evaluation: FlagEvaluationService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<MyFlags> {
    return this.evaluation.myFlags(user);
  }
}
