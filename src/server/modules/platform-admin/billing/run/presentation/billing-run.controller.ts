import { Controller, HttpCode, Post } from '@nestjs/common';
import type { AdminSession } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { BillingJob } from '../application/billing-job.js';

/** /api/admin/billing/run: "Run now", the daily billing run (invoices + dunning) as the Super Admin (Phase 41). */
@AdminRoute()
@Controller('admin/billing')
export class BillingRunController {
  constructor(private readonly job: BillingJob) {}

  @Post('run')
  @HttpCode(200)
  run(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta) {
    return this.job.runNow(admin, meta, 'all');
  }
}
