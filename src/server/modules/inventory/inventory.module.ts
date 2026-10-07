import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module.js';
import { BatchStore } from './batches/application/batch-store.js';
import { BatchesService } from './batches/application/batches.service.js';
import { PrismaBatchStore } from './batches/infrastructure/prisma-batch.store.js';
import { BatchesController } from './batches/presentation/batches.controller.js';
import { KitStore } from './kits/application/kit-store.js';
import { KitsService } from './kits/application/kits.service.js';
import { PrismaKitStore } from './kits/infrastructure/prisma-kit.store.js';
import { KitsController } from './kits/presentation/kits.controller.js';
import { LabelStore } from './labels/application/label-store.js';
import { LabelsService } from './labels/application/labels.service.js';
import { PrismaLabelStore } from './labels/infrastructure/prisma-label.store.js';
import { LabelsController } from './labels/presentation/labels.controller.js';
import { ProductStore } from './products/application/product-store.js';
import { ProductsService } from './products/application/products.service.js';
import { PrismaProductStore } from './products/infrastructure/prisma-product.store.js';
import { ProductsController } from './products/presentation/products.controller.js';
import { ReorderStore } from './reorder/application/reorder-store.js';
import { ReorderService } from './reorder/application/reorder.service.js';
import { PrismaReorderStore } from './reorder/infrastructure/prisma-reorder.store.js';
import { ReorderController } from './reorder/presentation/reorder.controller.js';
import { ClassesService } from './classes/application/classes.service.js';
import { ClassStore } from './classes/application/class-store.js';
import { PrismaClassStore } from './classes/infrastructure/prisma-class.store.js';
import { ClassesController } from './classes/presentation/classes.controller.js';
import { CompaniesService } from './companies/application/companies.service.js';
import { CompanyStore } from './companies/application/company-store.js';
import { PrismaCompanyStore } from './companies/infrastructure/prisma-company.store.js';
import { CompaniesController } from './companies/presentation/companies.controller.js';
import { ReasonStore } from './reasons/application/reason-store.js';
import { ReasonsService } from './reasons/application/reasons.service.js';
import { PrismaReasonStore } from './reasons/infrastructure/prisma-reason.store.js';
import { ReasonsController } from './reasons/presentation/reasons.controller.js';
import { UnitStore } from './units/application/unit-store.js';
import { UnitsService } from './units/application/units.service.js';
import { PrismaUnitStore } from './units/infrastructure/prisma-unit.store.js';
import { UnitsController } from './units/presentation/units.controller.js';
import { WarehouseStore } from './warehouses/application/warehouse-store.js';
import { WarehousesService } from './warehouses/application/warehouses.service.js';
import { PrismaWarehouseStore } from './warehouses/infrastructure/prisma-warehouse.store.js';
import { WarehousesController } from './warehouses/presentation/warehouses.controller.js';

/** Inventory masters: Phase 6 (units, companies, classes, warehouses & bins, movement reasons) and Phase 8 (products, batches, kits, labels, reorder rules). */
@Module({
  imports: [TreasuryModule],
  controllers: [UnitsController, CompaniesController, ClassesController, WarehousesController, ReasonsController, ProductsController, BatchesController, KitsController, LabelsController, ReorderController],
  providers: [
    UnitsService, { provide: UnitStore, useClass: PrismaUnitStore },
    CompaniesService, { provide: CompanyStore, useClass: PrismaCompanyStore },
    ClassesService, { provide: ClassStore, useClass: PrismaClassStore },
    WarehousesService, { provide: WarehouseStore, useClass: PrismaWarehouseStore },
    ReasonsService, { provide: ReasonStore, useClass: PrismaReasonStore },
    ProductsService, { provide: ProductStore, useClass: PrismaProductStore },
    BatchesService, { provide: BatchStore, useClass: PrismaBatchStore },
    KitsService, { provide: KitStore, useClass: PrismaKitStore },
    LabelsService, { provide: LabelStore, useClass: PrismaLabelStore },
    ReorderService, { provide: ReorderStore, useClass: PrismaReorderStore },
  ],
})
export class InventoryModule {}
