import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { BackupRunner, BackupStore } from './backups/application/backup-store.js';
import { BackupsService } from './backups/application/backups.service.js';
import { PgDumpBackupRunner } from './backups/infrastructure/pg-dump-backup-runner.js';
import { PrismaBackupStore } from './backups/infrastructure/prisma-backup.store.js';
import { BackupsController } from './backups/presentation/backups.controller.js';
import { DunningPoliciesService } from './dunning/application/dunning-policies.service.js';
import { DunningPolicyStore } from './dunning/application/dunning-policy-store.js';
import { PrismaDunningPolicyStore } from './dunning/infrastructure/prisma-dunning-policy.store.js';
import { DunningPoliciesController } from './dunning/presentation/dunning-policies.controller.js';
import { ApiKeysService } from './integrations/application/api-keys.service.js';
import { ApiKeyStore, WebhookSender, WebhookStore } from './integrations/application/integration-store.js';
import { WebhooksService } from './integrations/application/webhooks.service.js';
import { FetchWebhookSender } from './integrations/infrastructure/fetch-webhook-sender.js';
import { PrismaApiKeyStore, PrismaWebhookStore } from './integrations/infrastructure/prisma-integration.stores.js';
import { ApiKeysController, WebhooksController } from './integrations/presentation/integrations.controller.js';
import { ResellerStore } from './resellers/application/reseller-store.js';
import { ResellersService } from './resellers/application/resellers.service.js';
import { PrismaResellerStore } from './resellers/infrastructure/prisma-reseller.store.js';
import { ResellersController } from './resellers/presentation/resellers.controller.js';
import { SecurityStore } from './security/application/security-store.js';
import { SecurityService } from './security/application/security.service.js';
import { PrismaSecurityStore } from './security/infrastructure/prisma-security.store.js';
import { SecurityController } from './security/presentation/security.controller.js';
import { SegmentStore } from './segments/application/segment-store.js';
import { SegmentsService } from './segments/application/segments.service.js';
import { PrismaSegmentStore } from './segments/infrastructure/prisma-segment.store.js';
import { SegmentsController } from './segments/presentation/segments.controller.js';

/**
 * Phase 38: platform configuration under /api/admin: dunning policies, tenant segments, resellers, platform security
 * (settings + IP allow-list), per-tenant API keys and webhooks, backups. The Super Admin sign-in enforcement
 * (AdminLoginPolicy) is provided by PlatformAdminModule, next to AdminAuthService.
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [
    DunningPoliciesController, SegmentsController, ResellersController, SecurityController, ApiKeysController, WebhooksController, BackupsController,
  ],
  providers: [
    DunningPoliciesService, { provide: DunningPolicyStore, useClass: PrismaDunningPolicyStore },
    SegmentsService, { provide: SegmentStore, useClass: PrismaSegmentStore },
    ResellersService, { provide: ResellerStore, useClass: PrismaResellerStore },
    SecurityService, { provide: SecurityStore, useClass: PrismaSecurityStore },
    ApiKeysService, { provide: ApiKeyStore, useClass: PrismaApiKeyStore },
    WebhooksService, { provide: WebhookStore, useClass: PrismaWebhookStore }, { provide: WebhookSender, useClass: FetchWebhookSender },
    BackupsService, { provide: BackupStore, useClass: PrismaBackupStore }, { provide: BackupRunner, useClass: PgDumpBackupRunner },
  ],
})
export class PlatformConfigModule {}
