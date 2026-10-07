import { Module } from '@nestjs/common';
import { PriceListStore } from './price-lists/application/price-list-store.js';
import { PriceListsService } from './price-lists/application/price-lists.service.js';
import { PrismaPriceListStore } from './price-lists/infrastructure/prisma-price-list.store.js';
import { PriceListsController } from './price-lists/presentation/price-lists.controller.js';
import { PriceTierStore } from './price-tiers/application/price-tier-store.js';
import { PriceTiersService } from './price-tiers/application/price-tiers.service.js';
import { PrismaPriceTierStore } from './price-tiers/infrastructure/prisma-price-tier.store.js';
import { PriceTiersController } from './price-tiers/presentation/price-tiers.controller.js';
import { SchemeStore } from './schemes/application/scheme-store.js';
import { SchemesService } from './schemes/application/schemes.service.js';
import { PrismaSchemeStore } from './schemes/infrastructure/prisma-scheme.store.js';
import { SchemesController } from './schemes/presentation/schemes.controller.js';

/** Sales setup (Phase 9): price lists with quantity breaks, trade schemes, wholesale price tiers. */
@Module({
  controllers: [PriceListsController, SchemesController, PriceTiersController],
  providers: [
    PriceListsService, { provide: PriceListStore, useClass: PrismaPriceListStore },
    SchemesService, { provide: SchemeStore, useClass: PrismaSchemeStore },
    PriceTiersService, { provide: PriceTierStore, useClass: PrismaPriceTierStore },
  ],
})
export class SalesSetupModule {}
