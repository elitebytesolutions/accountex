import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { ImpersonationService } from './impersonation/application/impersonation.service.js';
import { ImpersonationStore } from './impersonation/application/impersonation-store.js';
import { PrismaImpersonationStore } from './impersonation/infrastructure/prisma-impersonation.store.js';
import { ImpersonationController } from './impersonation/presentation/impersonation.controller.js';
import { SupportAccessController } from './impersonation/presentation/support-access.controller.js';
import { SubscriptionStore } from './subscriptions/application/subscription-store.js';
import { SubscriptionsService } from './subscriptions/application/subscriptions.service.js';
import { PrismaSubscriptionStore } from './subscriptions/infrastructure/prisma-subscription.store.js';
import { SubscriptionsController } from './subscriptions/presentation/subscriptions.controller.js';
import { TenantStore } from './tenants/application/tenant-store.js';
import { TenantsService } from './tenants/application/tenants.service.js';
import { PrismaTenantStore } from './tenants/infrastructure/prisma-tenant.store.js';
import { TenantsController } from './tenants/presentation/tenants.controller.js';
import { UsageStore } from './usage/application/usage-store.js';
import { UsageService } from './usage/application/usage.service.js';
import { PrismaUsageStore } from './usage/infrastructure/prisma-usage.store.js';
import { UsageController } from './usage/presentation/usage.controller.js';

/**
 * Phase 40: tenant lifecycle (/api/admin/{tenants,subscriptions,usage,impersonation}) and the company's side of
 * support access (/api/me/support-access).
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [TenantsController, SubscriptionsController, UsageController, ImpersonationController, SupportAccessController],
  providers: [
    TenantsService, { provide: TenantStore, useClass: PrismaTenantStore },
    SubscriptionsService, { provide: SubscriptionStore, useClass: PrismaSubscriptionStore },
    UsageService, { provide: UsageStore, useClass: PrismaUsageStore },
    ImpersonationService, { provide: ImpersonationStore, useClass: PrismaImpersonationStore },
  ],
})
export class PlatformTenantLifecycleModule {}
