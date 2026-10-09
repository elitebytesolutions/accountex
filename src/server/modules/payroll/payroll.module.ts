import { Module } from '@nestjs/common';
import { ComponentStore } from './components/application/component-store.js';
import { ComponentsService } from './components/application/components.service.js';
import { PrismaComponentStore } from './components/infrastructure/prisma-component.store.js';
import { ComponentsController } from './components/presentation/components.controller.js';
import { PayGroupStore, TaxSlabStore } from './pay-groups/application/pay-group-store.js';
import { PayGroupsService } from './pay-groups/application/pay-groups.service.js';
import { PrismaPayGroupStore, PrismaTaxSlabStore } from './pay-groups/infrastructure/prisma-pay-group.store.js';
import { PayGroupsController } from './pay-groups/presentation/pay-groups.controller.js';
import { SalaryStore } from './salaries/application/salary-store.js';
import { SalariesService } from './salaries/application/salaries.service.js';
import { PrismaSalaryStore } from './salaries/infrastructure/prisma-salary.store.js';
import { SalariesController } from './salaries/presentation/salaries.controller.js';
import { StructureStore } from './structures/application/structure-store.js';
import { StructuresService } from './structures/application/structures.service.js';
import { PrismaStructureStore } from './structures/infrastructure/prisma-structure.store.js';
import { StructuresController } from './structures/presentation/structures.controller.js';
import { MasterSlabSource, SlabImportService } from './tax-master-import/application/slab-import.service.js';
import { PrismaMasterSlabSource } from './tax-master-import/infrastructure/prisma-master-slab.source.js';
import { SlabImportController } from './tax-master-import/presentation/slab-import.controller.js';
// Phase 32
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { LoanStore } from './loans/application/loan-store.js';
import { LoansService } from './loans/application/loans.service.js';
import { PrismaLoanStore } from './loans/infrastructure/prisma-loan.store.js';
import { LoansController, MyLoansController } from './loans/presentation/loans.controller.js';
import { PayslipStore } from './payslips/application/payslip-store.js';
import { PayslipsService } from './payslips/application/payslips.service.js';
import { PrismaPayslipStore } from './payslips/infrastructure/prisma-payslip.store.js';
import { MyPayslipsController, PayslipsController } from './payslips/presentation/payslips.controller.js';
import { RunStore } from './runs/application/run-store.js';
import { RunsService } from './runs/application/runs.service.js';
import { PrismaRunStore } from './runs/infrastructure/prisma-run.store.js';
import { RunsController } from './runs/presentation/runs.controller.js';
import { TaxDeclarationStore } from './tax-declarations/application/tax-declaration-store.js';
import { TaxDeclarationsService } from './tax-declarations/application/tax-declarations.service.js';
import { PrismaTaxDeclarationStore } from './tax-declarations/infrastructure/prisma-tax-declaration.store.js';
import { MyTaxDeclarationsController, TaxDeclarationsController } from './tax-declarations/presentation/tax-declarations.controller.js';
// Phase 33 (exits): final settlements
import { SettlementStore } from './final-settlements/application/settlement-store.js';
import { FinalSettlementsService } from './final-settlements/application/final-settlements.service.js';
import { PrismaSettlementStore } from './final-settlements/infrastructure/prisma-settlement.store.js';
import { FinalSettlementsController } from './final-settlements/presentation/final-settlements.controller.js';

/** Payroll setup (Phase 12): salary components, structures, pay groups, salary tax slabs and employee salaries. */
@Module({
  imports: [ApprovalsModule, AttachmentsModule],
  controllers: [
    ComponentsController, StructuresController, PayGroupsController, SalariesController, SlabImportController,
    // Phase 32: payroll runs, loans, payslips, tax declarations (+ My Profile)
    RunsController, LoansController, MyLoansController, PayslipsController, MyPayslipsController, TaxDeclarationsController, MyTaxDeclarationsController,
    FinalSettlementsController, // Phase 33 exits
  ],
  providers: [
    // Phase 32
    RunsService, { provide: RunStore, useClass: PrismaRunStore },
    LoansService, { provide: LoanStore, useClass: PrismaLoanStore },
    PayslipsService, { provide: PayslipStore, useClass: PrismaPayslipStore },
    TaxDeclarationsService, { provide: TaxDeclarationStore, useClass: PrismaTaxDeclarationStore },
    ComponentsService, { provide: ComponentStore, useClass: PrismaComponentStore },
    StructuresService, { provide: StructureStore, useClass: PrismaStructureStore },
    PayGroupsService, { provide: PayGroupStore, useClass: PrismaPayGroupStore }, { provide: TaxSlabStore, useClass: PrismaTaxSlabStore },
    SalariesService, { provide: SalaryStore, useClass: PrismaSalaryStore },
    // Phase 37: "Import from Tax Master" (section 149 slabs)
    SlabImportService, { provide: MasterSlabSource, useClass: PrismaMasterSlabSource },
    // Phase 33 exits
    FinalSettlementsService, { provide: SettlementStore, useClass: PrismaSettlementStore },
  ],
})
export class PayrollModule {}
