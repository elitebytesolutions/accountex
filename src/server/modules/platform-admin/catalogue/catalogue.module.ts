import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { AddonStore } from './addons/application/addon-store.js';
import { AddonsService } from './addons/application/addons.service.js';
import { PrismaAddonStore } from './addons/infrastructure/prisma-addon.store.js';
import { AddonsController } from './addons/presentation/addons.controller.js';
import { CouponStore } from './coupons/application/coupon-store.js';
import { CouponsService } from './coupons/application/coupons.service.js';
import { PrismaCouponStore } from './coupons/infrastructure/prisma-coupon.store.js';
import { CouponsController } from './coupons/presentation/coupons.controller.js';
import { ModuleStore } from './modules/application/module-store.js';
import { ModulesService } from './modules/application/modules.service.js';
import { PrismaModuleStore } from './modules/infrastructure/prisma-module.store.js';
import { ModulesController } from './modules/presentation/modules.controller.js';
import { PlanStore } from './plans/application/plan-store.js';
import { PlansService } from './plans/application/plans.service.js';
import { PrismaPlanStore } from './plans/infrastructure/prisma-plan.store.js';
import { PlansController } from './plans/presentation/plans.controller.js';

/** Phase 36: the Super Admin's commercial catalogue (/api/admin/{plans,modules,addons,coupons}). */
@Module({
  imports: [PlatformAdminModule],
  controllers: [PlansController, ModulesController, AddonsController, CouponsController],
  providers: [
    PlansService, { provide: PlanStore, useClass: PrismaPlanStore },
    ModulesService, { provide: ModuleStore, useClass: PrismaModuleStore },
    AddonsService, { provide: AddonStore, useClass: PrismaAddonStore },
    CouponsService, { provide: CouponStore, useClass: PrismaCouponStore },
  ],
})
export class PlatformCatalogueModule {}
