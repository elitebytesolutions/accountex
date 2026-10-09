import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { EmployeeAssetIssueSchema, EmployeeAssetReturnSchema, type EmployeeAssetIssue, type EmployeeAssetReturn, type SessionUser } from '../../../../../shared/index.js';
import { ReqMeta } from '../../../../common/context/request-meta.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { RequirePermission } from '../../../../common/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { EmployeeAssetsService } from '../application/assets.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/** /api/hr: assets issued to employees (Phase 33), on the employee view's Assets tab. */
@Controller('hr')
export class EmployeeAssetsController {
  constructor(private readonly assets: EmployeeAssetsService) {}

  @Get('assets/options')
  @RequirePermission('emp:view')
  options(@CurrentUser() user: SessionUser) {
    return this.assets.options(user);
  }

  @Get('employees/:id/assets')
  @RequirePermission('emp:view')
  list(@CurrentUser() user: SessionUser, @Param('id', uuid) id: string) {
    return this.assets.list(user, id);
  }

  /** 409 EMPLOYEE_ASSET_ALREADY_ISSUED when the fixed asset has a holder. */
  @Post('employees/:id/assets')
  @RequirePermission('emp:edit')
  issue(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(EmployeeAssetIssueSchema)) body: EmployeeAssetIssue) {
    return this.assets.issue(user, meta, id, body);
  }

  /** Returned → its clearance item of an open exit is cleared. */
  @Post('assets/:id/return')
  @HttpCode(200)
  @RequirePermission('emp:edit')
  return(@CurrentUser() user: SessionUser, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string, @Body(pipe(EmployeeAssetReturnSchema)) body: EmployeeAssetReturn) {
    return this.assets.return(user, meta, id, body);
  }
}
