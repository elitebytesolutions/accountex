import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module.js';
import { AssetCategoriesService } from './categories/application/asset-categories.service.js';
import { AssetCategoryStore } from './categories/application/asset-category-store.js';
import { PrismaAssetCategoryStore } from './categories/infrastructure/prisma-asset-category.store.js';
import { AssetCategoriesController } from './categories/presentation/asset-categories.controller.js';
import { DepreciationRunsService } from './depreciation/application/depreciation-runs.service.js';
import { AssetMovementsService } from './movements/application/asset-movements.service.js';
import { FixedAssetStore } from './register/application/fixed-asset-store.js';
import { FixedAssetsService } from './register/application/fixed-assets.service.js';
import { PrismaFixedAssetStore } from './register/infrastructure/prisma-fixed-asset.store.js';
import {
  AssetDisposalsController, AssetTransfersController, DepreciationRunsController, FixedAssetsController,
} from './register/presentation/fixed-assets.controller.js';

/**
 * Fixed assets: categories (Phase 5); the register with capitalisation, monthly depreciation runs, transfers and
 * disposals (Phase 27). Controllers under /assets/<word> are listed before the register's /assets/:id routes.
 */
@Module({
  imports: [TreasuryModule],
  controllers: [AssetCategoriesController, DepreciationRunsController, AssetTransfersController, AssetDisposalsController, FixedAssetsController],
  providers: [
    AssetCategoriesService, { provide: AssetCategoryStore, useClass: PrismaAssetCategoryStore },
    { provide: FixedAssetStore, useClass: PrismaFixedAssetStore }, FixedAssetsService, AssetMovementsService, DepreciationRunsService,
  ],
})
export class AssetsModule {}
