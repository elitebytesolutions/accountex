import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AdminSession } from '../../../../../../shared/index.js';
import { ReqMeta } from '../../../../../common/context/request-meta.js';
import { AdminRoute } from '../../../../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../../../../common/decorators/current-admin.decorator.js';
import type { RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { BackupsService } from '../application/backups.service.js';

/** /api/admin/backups: the Backups panel of System › System Health. */
@AdminRoute()
@Controller('admin/backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  list() {
    return this.backups.list();
  }

  /** Starts a full backup (pg_dump) and returns its RUNNING row; 409 BACKUP_ALREADY_RUNNING while one runs. */
  @Post('run')
  @HttpCode(202)
  run(@CurrentAdmin() admin: AdminSession, @ReqMeta() meta: RequestMeta) {
    return this.backups.run(admin, meta);
  }
}
