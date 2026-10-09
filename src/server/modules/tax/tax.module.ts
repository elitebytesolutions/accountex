import { Module } from '@nestjs/common';
import { TreasuryModule } from '../treasury/treasury.module.js';
import { WhtCertificatesService } from './certificates/application/wht-certificates.service.js';
import { WhtCertificatesController, WhtStatementsController } from './certificates/presentation/wht-certificates.controller.js';
import { TaxStore } from './common/application/tax-store.js';
import { PrismaTaxStore } from './common/infrastructure/prisma-tax.store.js';
import { FbrGateway } from './fbr/application/fbr-gateway.js';
import { FbrSubmissionsService } from './fbr/application/fbr-submissions.service.js';
import { HttpFbrGateway, RoutingFbrGateway, SimulatedFbrGateway } from './fbr/infrastructure/fbr-gateways.js';
import { FbrSubmissionsController } from './fbr/presentation/fbr-submissions.controller.js';
import { SalesTaxReturnsService } from './returns/application/sales-tax-returns.service.js';
import { SalesTaxReturnsController, TaxOptionsController } from './returns/presentation/sales-tax-returns.controller.js';
import { WhtService } from './wht/application/wht.service.js';
import { WhtChallansController, WhtController } from './wht/presentation/wht.controller.js';

/**
 * Tax compliance (Phase 28): sales tax returns, the WHT register with challans, certificates and statements, and FBR
 * submissions with the sync job. FBR settings stay in Treasury (Phase 5); its FbrService supplies the API token.
 * Controllers under /tax/wht/<word> are listed before the register's /tax/wht/:id routes.
 */
@Module({
  imports: [TreasuryModule],
  controllers: [
    TaxOptionsController, SalesTaxReturnsController,
    WhtChallansController, WhtCertificatesController, WhtStatementsController, WhtController,
    FbrSubmissionsController,
  ],
  providers: [
    { provide: TaxStore, useClass: PrismaTaxStore },
    HttpFbrGateway, SimulatedFbrGateway, { provide: FbrGateway, useClass: RoutingFbrGateway },
    SalesTaxReturnsService, WhtService, WhtCertificatesService, FbrSubmissionsService,
  ],
})
export class TaxModule {}
