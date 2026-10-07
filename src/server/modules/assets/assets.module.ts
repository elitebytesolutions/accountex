import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module.js';
import { AssetCategoriesService } from './categories/application/asset-categories.service.js';
import { AssetCategoryStore } from './categories/application/asset-category-store.js';
import { PrismaAssetCategoryStore } from './categories/infrastructure/prisma-asset-category.store.js';
import { AssetCategoriesController } from './categories/presentation/asset-categories.controller.js';

/** Fixed assets masters (Phase 5: asset categories). The register and depreciation arrive in Phase 27. */
@Module({
  imports: [TreasuryModule],
  controllers: [AssetCategoriesController],
  providers: [AssetCategoriesService, { provide: AssetCategoryStore, useClass: PrismaAssetCategoryStore }],
})
export class AssetsModule {}
