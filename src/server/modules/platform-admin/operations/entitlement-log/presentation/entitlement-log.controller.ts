import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { EntitlementSaveSchema, type AdminSession, type EntitlementSave } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { EntitlementLogService } from '../application/entitlement-log.service.js';

/** /api/admin/entitlements: the Plan Entitlements save and its change log (Phase 43). */
@AdminRoute()
@Controller('admin/entitlements')
export class EntitlementLogController {
  constructor(private readonly log: EntitlementLogService) {}

  /** Past change sets, newest first ("Change log" tab). */
  @Get('changes')
  changes() {
    return this.log.changeSets();
  }

  /** "Save entitlements": every change of the drawer in one transaction, logged with its impact. */
  @Post('save')
  @HttpCode(200)
  save(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(new ZodValidationPipe(EntitlementSaveSchema)) body: EntitlementSave) {
    return this.log.save(admin, meta, body);
  }
}
