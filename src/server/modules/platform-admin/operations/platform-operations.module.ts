import { Module } from '@nestjs/common';
import { PlatformCatalogueModule } from '../catalogue/catalogue.module.js';
import { BackupRunner, BackupStore } from '../config/backups/application/backup-store.js';
import { BackupsService } from '../config/backups/application/backups.service.js';
import { PgDumpBackupRunner } from '../config/backups/infrastructure/pg-dump-backup-runner.js';
import { PrismaBackupStore } from '../config/backups/infrastructure/prisma-backup.store.js';
import { PlatformFlagsModule } from '../flags/platform-flags.module.js';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { ChangeRequestStore } from './change-requests/application/change-request-store.js';
import { ChangeRequestsService } from './change-requests/application/change-requests.service.js';
import { OpsJob } from './change-requests/application/ops-job.js';
import { PrismaChangeRequestStore } from './change-requests/infrastructure/prisma-change-request.store.js';
import { ChangeRequestsController, FlagScheduleController } from './change-requests/presentation/change-requests.controller.js';
import { EntitlementLogStore } from './entitlement-log/application/entitlement-log-store.js';
import { EntitlementLogService } from './entitlement-log/application/entitlement-log.service.js';
import { PrismaEntitlementLogStore } from './entitlement-log/infrastructure/prisma-entitlement-log.store.js';
import { EntitlementLogController } from './entitlement-log/presentation/entitlement-log.controller.js';
import { IncidentStore } from './incidents/application/incident-store.js';
import { IncidentsService } from './incidents/application/incidents.service.js';
import { PrismaIncidentStore } from './incidents/infrastructure/prisma-incident.store.js';
import { IncidentsController } from './incidents/presentation/incidents.controller.js';
import { StatusController } from './incidents/presentation/status.controller.js';
import { PrivacyStore } from './privacy/application/privacy-store.js';
import { PrivacyService } from './privacy/application/privacy.service.js';
import { PrismaPrivacyStore } from './privacy/infrastructure/prisma-privacy.store.js';
import { PrivacyController } from './privacy/presentation/privacy.controller.js';

/**
 * Phase 43: platform operations: service incidents (+ the public status page and the workspace banner data), flag
 * change requests with scheduled rollout steps and the ops job, privacy requests (export through the backup runner's
 * TENANT_EXPORT mode, erasure in the database) and the entitlement change log.
 */
@Module({
  imports: [PlatformAdminModule, PlatformFlagsModule, PlatformCatalogueModule],
  controllers: [IncidentsController, StatusController, ChangeRequestsController, FlagScheduleController, PrivacyController, EntitlementLogController],
  providers: [
    IncidentsService, { provide: IncidentStore, useClass: PrismaIncidentStore },
    ChangeRequestsService, OpsJob, { provide: ChangeRequestStore, useClass: PrismaChangeRequestStore },
    PrivacyService, { provide: PrivacyStore, useClass: PrismaPrivacyStore },
    BackupsService, { provide: BackupStore, useClass: PrismaBackupStore }, { provide: BackupRunner, useClass: PgDumpBackupRunner },
    EntitlementLogService, { provide: EntitlementLogStore, useClass: PrismaEntitlementLogStore },
  ],
})
export class PlatformOperationsModule {}
