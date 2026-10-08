import { Module } from '@nestjs/common';
import { PlatformAdminModule } from '../platform-admin.module.js';
import { CoaTemplateStore } from './coa/application/coa-template-store.js';
import { CoaTemplatesService } from './coa/application/coa-templates.service.js';
import { PrismaCoaTemplateStore } from './coa/infrastructure/prisma-coa-template.store.js';
import { CoaTemplatesController } from './coa/presentation/coa-templates.controller.js';
import { CommTemplateStore } from './comms/application/comm-template-store.js';
import { CommTemplatesService } from './comms/application/comm-templates.service.js';
import { PrismaCommTemplateStore } from './comms/infrastructure/prisma-comm-template.store.js';
import { CommTemplatesController } from './comms/presentation/comm-templates.controller.js';
import { RoleGrantsService } from './seed/application/role-grants.service.js';
import { RoleGrantStore, SeedStore } from './seed/application/seed-store.js';
import { SeedTemplatesService } from './seed/application/seed-templates.service.js';
import { PrismaRoleGrantStore, PrismaSeedStore } from './seed/infrastructure/prisma-seed.store.js';
import { SeedTemplatesController } from './seed/presentation/seed-templates.controller.js';
import { TaxAuthorityGateway, TaxMasterStore } from './tax-master/application/tax-master-store.js';
import { TaxMasterService } from './tax-master/application/tax-master.service.js';
import { HttpTaxAuthorityGateway } from './tax-master/infrastructure/http-tax-authority.gateway.js';
import { PrismaTaxMasterStore } from './tax-master/infrastructure/prisma-tax-master.store.js';
import { TaxMasterController } from './tax-master/presentation/tax-master.controller.js';

/**
 * Phase 37: seed templates & tax master (/api/admin/{coa-templates,seed,tax-master,comm-templates}): the templates new
 * companies start from, default role grants, the Pakistan tax master and communication templates.
 */
@Module({
  imports: [PlatformAdminModule],
  controllers: [CoaTemplatesController, SeedTemplatesController, TaxMasterController, CommTemplatesController],
  providers: [
    CoaTemplatesService, { provide: CoaTemplateStore, useClass: PrismaCoaTemplateStore },
    SeedTemplatesService, { provide: SeedStore, useClass: PrismaSeedStore },
    RoleGrantsService, { provide: RoleGrantStore, useClass: PrismaRoleGrantStore },
    TaxMasterService, { provide: TaxMasterStore, useClass: PrismaTaxMasterStore }, { provide: TaxAuthorityGateway, useClass: HttpTaxAuthorityGateway },
    CommTemplatesService, { provide: CommTemplateStore, useClass: PrismaCommTemplateStore },
  ],
})
export class PlatformTemplatesModule {}
