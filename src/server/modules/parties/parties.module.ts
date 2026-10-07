import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module.js';
import { CustomerGroupStore } from './customer-groups/application/customer-group-store.js';
import { CustomerGroupsService } from './customer-groups/application/customer-groups.service.js';
import { PrismaCustomerGroupStore } from './customer-groups/infrastructure/prisma-customer-group.store.js';
import { CustomerGroupsController } from './customer-groups/presentation/customer-groups.controller.js';
import { CustomerStore } from './customers/application/customer-store.js';
import { CustomersService } from './customers/application/customers.service.js';
import { PrismaCustomerStore } from './customers/infrastructure/prisma-customer.store.js';
import { CustomersController } from './customers/presentation/customers.controller.js';
import { VendorCategoryStore } from './vendor-categories/application/vendor-category-store.js';
import { VendorCategoriesService } from './vendor-categories/application/vendor-categories.service.js';
import { PrismaVendorCategoryStore } from './vendor-categories/infrastructure/prisma-vendor-category.store.js';
import { VendorCategoriesController } from './vendor-categories/presentation/vendor-categories.controller.js';
import { VendorStore } from './vendors/application/vendor-store.js';
import { VendorsService } from './vendors/application/vendors.service.js';
import { PrismaVendorStore } from './vendors/infrastructure/prisma-vendor.store.js';
import { VendorsController } from './vendors/presentation/vendors.controller.js';

/** Parties (Phase 7): customer groups, customers, vendor categories, vendors. */
@Module({
  imports: [TreasuryModule],
  controllers: [CustomerGroupsController, CustomersController, VendorCategoriesController, VendorsController],
  providers: [
    CustomerGroupsService, { provide: CustomerGroupStore, useClass: PrismaCustomerGroupStore },
    CustomersService, { provide: CustomerStore, useClass: PrismaCustomerStore },
    VendorCategoriesService, { provide: VendorCategoryStore, useClass: PrismaVendorCategoryStore },
    VendorsService, { provide: VendorStore, useClass: PrismaVendorStore },
  ],
})
export class PartiesModule {}
