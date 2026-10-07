import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { BranchHrSchema, type BranchHrInput, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { OrgService } from '../application/org.service.js';

type View = 'people' | 'departments' | 'positions';

/**
 * /api/hr/org (the chart), /api/hr/form-options (department / designation / grade forms), /api/hr/branches (holiday and
 * device forms) and /api/hr/branch-settings (the Branches tab of Departments & Designations).
 */
@Controller('hr')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('org')
  @RequirePermission('emp:view')
  chart(@CurrentUser() user: SessionUser, @Query(new ZodValidationPipe(z.object({ view: z.enum(['people', 'departments', 'positions']).default('people') }))) q: { view: View }) {
    return this.org.chart(user, q.view);
  }

  @Get('form-options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.org.options(user);
  }

  @Get('branches')
  @RequirePermission('att:view')
  branches(@CurrentUser() user: SessionUser) {
    return this.org.branches(user);
  }

  @Get('branch-settings')
  @RequirePermission('emp:view')
  branchHr(@CurrentUser() user: SessionUser) {
    return this.org.branchHr(user);
  }

  @Put('branch-settings/:branchId')
  @RequirePermission('emp:edit')
  saveBranchHr(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('branchId', new ParseUUIDPipe()) branchId: string, @Body(new ZodValidationPipe(BranchHrSchema)) body: BranchHrInput) {
    return this.org.saveBranchHr(user, meta, branchId, body);
  }
}
