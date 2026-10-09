import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../../../../../shared/index.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import { MyTeamService } from '../application/my-team.service.js';

const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM').optional() });

/** /api/me/team: My Profile › My Team (line managers, myteam:view). Decisions go through the approvals inbox and the HR queues. */
@Controller('me/team')
export class MyTeamController {
  constructor(private readonly team: MyTeamService) {}

  @Get()
  @RequirePermission('myteam:view')
  overview(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(MonthQuery)) q: z.infer<typeof MonthQuery>) {
    return this.team.overview(user, q.month);
  }
}
