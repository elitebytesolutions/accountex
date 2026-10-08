import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { BroadcastInputSchema, CommLogQuerySchema, type AdminSession, type BroadcastInput, type CommLogQuery } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import { ZodValidationPipe } from '../../../../../common/pipes/zod-validation.pipe.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { CommsService } from '../application/comms.service.js';

const uuid = new ParseUUIDPipe();
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);

/**
 * Phase 42 on Super Admin › Communications: POST /api/admin/broadcasts (preview: true = count only) and the
 * append-only delivery log /api/admin/comm-logs (+ retry).
 */
@AdminRoute()
@Controller('admin')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @Post('broadcasts')
  @HttpCode(200)
  broadcast(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Body(pipe(BroadcastInputSchema)) body: BroadcastInput) {
    return this.comms.broadcast(admin, meta, body);
  }

  @Get('comm-logs')
  logs(@Query(pipe(CommLogQuerySchema)) q: CommLogQuery) {
    return this.comms.logs(q);
  }

  @Post('comm-logs/:id/retry')
  @HttpCode(200)
  retry(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta, @Param('id', uuid) id: string) {
    return this.comms.retry(admin, meta, id);
  }
}
