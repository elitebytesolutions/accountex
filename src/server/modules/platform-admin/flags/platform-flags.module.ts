import { Module } from '@nestjs/common';
import { AuditAlertRuleStore, MaintenanceWindowStore, UsageAlertRuleStore } from '../alerting/application/alerting-stores.js';
import { AuditAlertRulesService, UsageAlertRulesService } from '../alerting/application/alert-rules.service.js';
import { MaintenanceWindowsService } from '../alerting/application/maintenance-windows.service.js';
import { PrismaAuditAlertRuleStore, PrismaMaintenanceWindowStore, PrismaUsageAlertRuleStore } from '../alerting/infrastructure/prisma-alerting.stores.js';
import { AuditAlertRulesController, PlatformAuditLogController, UsageAlertRulesController } from '../alerting/presentation/alert-rules.controller.js';
import { MaintenanceWindowsController } from '../alerting/presentation/maintenance-windows.controller.js';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { EvaluationSource } from './application/evaluation-source.js';
import { FlagEvaluationService } from './application/flag-evaluation.service.js';
import { FlagStore } from './application/flag-store.js';
import { FlagsService } from './application/flags.service.js';
import { SdkKeyMinter, SdkKeyStore } from './application/sdk-key-store.js';
import { SdkKeysService } from './application/sdk-keys.service.js';
import { PrismaEvaluationSource } from './infrastructure/prisma-evaluation.source.js';
import { PrismaFlagStore } from './infrastructure/prisma-flag.store.js';
import { CryptoSdkKeyMinter, PrismaSdkKeyStore } from './infrastructure/prisma-sdk-key.store.js';
import { FlagsController } from './presentation/flags.controller.js';
import { SdkKeysController } from './presentation/sdk-keys.controller.js';

/**
 * Phase 39: feature flags (+ SDK keys, evaluation) and alerting (maintenance windows, usage / audit alert rules,
 * the read-only platform audit log). SdkKeysController is listed before FlagsController so /admin/flags/sdk-keys is
 * not taken by /admin/flags/:id.
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [SdkKeysController, FlagsController, MaintenanceWindowsController, UsageAlertRulesController, AuditAlertRulesController, PlatformAuditLogController],
  providers: [
    FlagsService, { provide: FlagStore, useClass: PrismaFlagStore },
    FlagEvaluationService, { provide: EvaluationSource, useClass: PrismaEvaluationSource },
    SdkKeysService, { provide: SdkKeyStore, useClass: PrismaSdkKeyStore }, { provide: SdkKeyMinter, useClass: CryptoSdkKeyMinter },
    MaintenanceWindowsService, { provide: MaintenanceWindowStore, useClass: PrismaMaintenanceWindowStore },
    UsageAlertRulesService, { provide: UsageAlertRuleStore, useClass: PrismaUsageAlertRuleStore },
    AuditAlertRulesService, { provide: AuditAlertRuleStore, useClass: PrismaAuditAlertRuleStore },
  ],
  exports: [FlagEvaluationService],
})
export class PlatformFlagsModule {}
