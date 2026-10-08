import { Module } from '@nestjs/common';
import { AdminAuthService } from './application/admin-auth.service.js';
import { PlatformAdminRepository } from './domain/platform-admin.repository.js';
import { GetPlatformHistory } from './history/application/get-platform-history.use-case.js';
import { PlatformHistoryStore } from './history/application/platform-history.store.js';
import { PrismaPlatformHistoryStore } from './history/infrastructure/prisma-platform-history.store.js';
import { AdminHistoryController } from './history/presentation/admin-history.controller.js';
import { AdminLookupsReader } from './lookups/application/admin-lookups.reader.js';
import { PrismaAdminLookupsReader } from './lookups/infrastructure/prisma-admin-lookups.reader.js';
import { AdminLookupsController } from './lookups/presentation/admin-lookups.controller.js';
import { PrismaPlatformAdminRepository } from './infrastructure/prisma-platform-admin.repository.js';
import { AdminAuthController } from './presentation/admin-auth.controller.js';
import { AdminLoginPolicy } from './config/security/application/admin-login-policy.js';
import { AdminLoginPolicyStore } from './config/security/application/security-store.js';
import { PrismaAdminLoginPolicyStore } from './config/security/infrastructure/prisma-security.store.js';

/**
 * Super Admin portal (/api/admin/*). Separate login table and token from the tenant workspace.
 * Also the Phase 36 foundation endpoints: platform history (/api/admin/history) and lookups (/api/admin/lookups).
 */
@Module({
  controllers: [AdminAuthController, AdminHistoryController, AdminLookupsController],
  providers: [
    AdminAuthService,
    { provide: PlatformAdminRepository, useClass: PrismaPlatformAdminRepository },
    GetPlatformHistory,
    { provide: PlatformHistoryStore, useClass: PrismaPlatformHistoryStore },
    { provide: AdminLookupsReader, useClass: PrismaAdminLookupsReader },
    // Phase 38: sign-in enforcement (IP allow-list, lockout, password policy) used by AdminAuthService
    AdminLoginPolicy,
    { provide: AdminLoginPolicyStore, useClass: PrismaAdminLoginPolicyStore },
  ],
  exports: [PlatformAdminRepository],
})
export class PlatformAdminModule {}
