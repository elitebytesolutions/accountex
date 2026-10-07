import { Module } from '@nestjs/common';
import { CommissionSlabStore } from './commission-slabs/application/commission-slab-store.js';
import { CommissionSlabsService } from './commission-slabs/application/commission-slabs.service.js';
import { PrismaCommissionSlabStore } from './commission-slabs/infrastructure/prisma-commission-slab.store.js';
import { CommissionSlabsController } from './commission-slabs/presentation/commission-slabs.controller.js';
import { RouteStore } from './routes/application/route-store.js';
import { RoutesService } from './routes/application/routes.service.js';
import { StaffDirectory } from './routes/application/staff-directory.js';
import { PrismaRouteStore } from './routes/infrastructure/prisma-route.store.js';
import { PrismaStaffDirectory } from './routes/infrastructure/prisma-staff-directory.js';
import { RoutesController } from './routes/presentation/routes.controller.js';
import { ShopProfilesController } from './routes/presentation/shop-profiles.controller.js';
import { ShopAreaStore } from './shop-areas/application/shop-area-store.js';
import { ShopAreasService } from './shop-areas/application/shop-areas.service.js';
import { PrismaShopAreaStore } from './shop-areas/infrastructure/prisma-shop-area.store.js';
import { ShopAreasController } from './shop-areas/presentation/shop-areas.controller.js';
import { VanStore } from './vans/application/van-store.js';
import { VansService } from './vans/application/vans.service.js';
import { PrismaVanStore } from './vans/infrastructure/prisma-van.store.js';
import { VansController } from './vans/presentation/vans.controller.js';

/** Distribution setup (Phase 14): shop areas, routes (visit days, stops, shop assignment, staff), vans, commission slabs. */
@Module({
  controllers: [ShopAreasController, RoutesController, ShopProfilesController, VansController, CommissionSlabsController],
  providers: [
    ShopAreasService, { provide: ShopAreaStore, useClass: PrismaShopAreaStore },
    RoutesService, { provide: RouteStore, useClass: PrismaRouteStore },
    { provide: StaffDirectory, useClass: PrismaStaffDirectory },
    VansService, { provide: VanStore, useClass: PrismaVanStore },
    CommissionSlabsService, { provide: CommissionSlabStore, useClass: PrismaCommissionSlabStore },
  ],
})
export class DistributionModule {}
