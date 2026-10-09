import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PartiesModule } from '../parties/parties.module.js';
import { BackupsService } from './backups/application/backups.service.js';
import { DataOpsStore, TenantSnapshots, WebhookSender } from './common/application/data-ops-store.js';
import { PrismaDataOpsStore } from './common/infrastructure/prisma-data-ops.store.js';
import { FetchWebhookSender, RunnerTenantSnapshots } from './common/infrastructure/tenant-snapshots.js';
import { DataImportsService } from './imports/application/data-imports.service.js';
import { BackupsController, DataImportsController, IntegrationsController } from './imports/presentation/data-ops.controller.js';
import { IntegrationsService } from './integrations/application/integrations.service.js';

/**
 * Data & collaboration — data side (Phase 35): imports through the masters' own use cases, integrations with outgoing
 * webhooks (API keys stay with the Super Admin), and company backups built on the platform tenant export.
 */
@Module({
  imports: [PartiesModule, InventoryModule],
  controllers: [DataImportsController, IntegrationsController, BackupsController],
  providers: [
    { provide: DataOpsStore, useClass: PrismaDataOpsStore },
    { provide: TenantSnapshots, useClass: RunnerTenantSnapshots },
    { provide: WebhookSender, useClass: FetchWebhookSender },
    DataImportsService, IntegrationsService, BackupsService,
  ],
})
export class DataOpsModule {}
