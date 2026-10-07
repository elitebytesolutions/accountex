import { Module } from '@nestjs/common';
import { BankRuleStore } from './bank-rules/application/bank-rule-store.js';
import { BankRulesService } from './bank-rules/application/bank-rules.service.js';
import { PrismaBankRuleStore } from './bank-rules/infrastructure/prisma-bank-rule.store.js';
import { BankRulesController } from './bank-rules/presentation/bank-rules.controller.js';
import { BankStore } from './banks/application/bank-store.js';
import { BanksService } from './banks/application/banks.service.js';
import { ChequeBooksService } from './banks/application/cheque-books.service.js';
import { PrismaBankStore } from './banks/infrastructure/prisma-bank.store.js';
import { BanksController } from './banks/presentation/banks.controller.js';
import { CashStore } from './cash/application/cash-store.js';
import { CashService } from './cash/application/cash.service.js';
import { PrismaCashStore } from './cash/infrastructure/prisma-cash.store.js';
import { CashController } from './cash/presentation/cash.controller.js';
import { FbrStore } from './fbr/application/fbr-store.js';
import { FbrService } from './fbr/application/fbr.service.js';
import { PrismaFbrStore } from './fbr/infrastructure/prisma-fbr.store.js';
import { FbrController } from './fbr/presentation/fbr.controller.js';
import { GlLinkStore } from './gl-links/application/gl-link-store.js';
import { GlLinks } from './gl-links/application/gl-links.js';
import { PrismaGlLinkStore } from './gl-links/infrastructure/prisma-gl-link.store.js';
import { PettyFundStore } from './petty-cash/application/petty-fund-store.js';
import { PettyCashService } from './petty-cash/application/petty-cash.service.js';
import { PrismaPettyFundStore } from './petty-cash/infrastructure/prisma-petty-fund.store.js';
import { PettyCashController } from './petty-cash/presentation/petty-cash.controller.js';
import { TaxCodeStore } from './tax-codes/application/tax-code-store.js';
import { TaxCodesService } from './tax-codes/application/tax-codes.service.js';
import { PrismaTaxCodeStore } from './tax-codes/infrastructure/prisma-tax-code.store.js';
import { TaxCodesController } from './tax-codes/presentation/tax-codes.controller.js';

/**
 * Tax & treasury masters. Phase 4: tax codes, banks & bank accounts, cheque books, cash accounts & categories, expense
 * categories. Phase 5: bank rules, petty cash funds, FBR / PRA settings.
 */
@Module({
  // PettyCashController before CashController: /cash/petty-funds/... must win over CashController's /cash/:resource/:id routes.
  controllers: [TaxCodesController, BanksController, PettyCashController, CashController, BankRulesController, FbrController],
  providers: [
    GlLinks,
    TaxCodesService,
    BanksService,
    ChequeBooksService,
    CashService,
    BankRulesService,
    PettyCashService,
    FbrService,
    { provide: BankRuleStore, useClass: PrismaBankRuleStore },
    { provide: PettyFundStore, useClass: PrismaPettyFundStore },
    { provide: FbrStore, useClass: PrismaFbrStore },
    { provide: GlLinkStore, useClass: PrismaGlLinkStore },
    { provide: TaxCodeStore, useClass: PrismaTaxCodeStore },
    { provide: BankStore, useClass: PrismaBankStore },
    { provide: CashStore, useClass: PrismaCashStore },
  ],
  exports: [GlLinks],
})
export class TreasuryModule {}
