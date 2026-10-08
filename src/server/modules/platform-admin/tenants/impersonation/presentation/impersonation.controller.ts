import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AdminSession } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ImpersonationService } from '../application/impersonation.service.js';

const Filter = z.object({ tenantId: z.uuid().optional(), live: z.enum(['true', 'false']).optional() });

/** /api/admin/impersonation: support sessions (started from Tenant 360: POST /api/admin/tenants/:id/impersonate). */
@AdminRoute()
@Controller('admin/impersonation')
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Get()
  list(@Query(new ZodValidationPipe(Filter)) q: z.infer<typeof Filter>) {
    return this.impersonation.list({ tenantId: q.tenantId, liveOnly: q.live === 'true' });
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.impersonation.end(admin, meta, id);
  }
}
