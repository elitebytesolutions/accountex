import { Module } from '@nestjs/common';
import { BranchStore } from './branches/application/branch-store.js';
import { BranchesService } from './branches/application/branches.service.js';
import { PrismaBranchStore } from './branches/infrastructure/prisma-branch.store.js';
import { BranchesController } from './branches/presentation/branches.controller.js';
import { CompanySettingsStore } from './company/application/company-settings-store.js';
import { CompanySettingsService } from './company/application/company-settings.service.js';
import { PrismaCompanySettingsStore } from './company/infrastructure/prisma-company-settings.store.js';
import { CompanySettingsController } from './company/presentation/company-settings.controller.js';
import { CurrenciesService } from './currencies/application/currencies.service.js';
import { CurrencyStore } from './currencies/application/currency-store.js';
import { PrismaCurrencyStore } from './currencies/infrastructure/prisma-currency.store.js';
import { CurrenciesController } from './currencies/presentation/currencies.controller.js';
import { TemplateStore } from './document-templates/application/template-store.js';
import { TemplatesService } from './document-templates/application/templates.service.js';
import { PrismaTemplateStore } from './document-templates/infrastructure/prisma-template.store.js';
import { TemplatesController } from './document-templates/presentation/templates.controller.js';
import { NumberingStore } from './numbering/application/numbering-store.js';
import { NumberingService } from './numbering/application/numbering.service.js';
import { PrismaNumberingStore } from './numbering/infrastructure/prisma-numbering.store.js';
import { NumberingController } from './numbering/presentation/numbering.controller.js';
import { SetupGuideStore } from './setup-guide/application/setup-guide-store.js';
import { SetupGuideService } from './setup-guide/application/setup-guide.service.js';
import { PrismaSetupGuideStore } from './setup-guide/infrastructure/prisma-setup-guide.store.js';
import { SetupGuideController } from './setup-guide/presentation/setup-guide.controller.js';

/** Phase 1 Company core: branches, currencies & rates, company settings, numbering series, setup guide. */
@Module({
  controllers: [BranchesController, CurrenciesController, CompanySettingsController, NumberingController, SetupGuideController, TemplatesController],
  providers: [
    BranchesService,
    CurrenciesService,
    CompanySettingsService,
    NumberingService,
    SetupGuideService,
    TemplatesService,
    { provide: BranchStore, useClass: PrismaBranchStore },
    { provide: CurrencyStore, useClass: PrismaCurrencyStore },
    { provide: CompanySettingsStore, useClass: PrismaCompanySettingsStore },
    { provide: NumberingStore, useClass: PrismaNumberingStore },
    { provide: SetupGuideStore, useClass: PrismaSetupGuideStore },
    { provide: TemplateStore, useClass: PrismaTemplateStore },
  ],
})
export class SettingsModule {}
