import { Module } from '@nestjs/common';
import { AccountStore } from './accounts/application/account-store.js';
import { AccountsService } from './accounts/application/accounts.service.js';
import { PrismaAccountStore } from './accounts/infrastructure/prisma-account.store.js';
import { AccountsController } from './accounts/presentation/accounts.controller.js';
import { CostCentresService } from './cost-centres/application/cost-centres.service.js';
import { CostStore } from './cost-centres/application/cost-store.js';
import { PrismaCostStore } from './cost-centres/infrastructure/prisma-cost.store.js';
import { CostCentresController } from './cost-centres/presentation/cost-centres.controller.js';
import { FiscalStore } from './fiscal/application/fiscal-store.js';
import { FiscalService } from './fiscal/application/fiscal.service.js';
import { PrismaFiscalStore } from './fiscal/infrastructure/prisma-fiscal.store.js';
import { FiscalController } from './fiscal/presentation/fiscal.controller.js';
import { MappingStore } from './mappings/application/mapping-store.js';
import { MappingsService } from './mappings/application/mappings.service.js';
import { PrismaMappingStore } from './mappings/infrastructure/prisma-mapping.store.js';
import { MappingsController } from './mappings/presentation/mappings.controller.js';

/** Phase 3 Finance structure: fiscal calendar, chart of accounts, cost centres & projects, account mappings. */
@Module({
  controllers: [FiscalController, AccountsController, CostCentresController, MappingsController],
  providers: [
    FiscalService,
    AccountsService,
    CostCentresService,
    MappingsService,
    { provide: FiscalStore, useClass: PrismaFiscalStore },
    { provide: AccountStore, useClass: PrismaAccountStore },
    { provide: CostStore, useClass: PrismaCostStore },
    { provide: MappingStore, useClass: PrismaMappingStore },
  ],
})
export class FinanceModule {}
