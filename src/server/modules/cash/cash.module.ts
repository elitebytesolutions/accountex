import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module.js';
import { BankingModule } from '../banking/banking.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CashBookStore } from './book/application/cash-book-store.js';
import { CashBookService } from './book/application/cash-book.service.js';
import { PrismaCashBookStore } from './book/infrastructure/prisma-cash-book.store.js';
import { CashBookController } from './book/presentation/cash-book.controller.js';
import { ClaimStore } from './claims/application/claim-store.js';
import { ExpenseClaimsService } from './claims/application/expense-claims.service.js';
import { PrismaClaimStore } from './claims/infrastructure/prisma-claim.store.js';
import { ExpenseClaimsController, MyExpenseClaimsController } from './claims/presentation/expense-claims.controller.js';
import { DayCloseStore } from './day-closes/application/day-close-store.js';
import { DayClosesService } from './day-closes/application/day-closes.service.js';
import { PrismaDayCloseStore } from './day-closes/infrastructure/prisma-day-close.store.js';
import { DayClosesController } from './day-closes/presentation/day-closes.controller.js';
import { PettyStore } from './petty/application/petty-store.js';
import { PettyService } from './petty/application/petty.service.js';
import { PrismaPettyStore } from './petty/infrastructure/prisma-petty.store.js';
import { PettyController } from './petty/presentation/petty.controller.js';

/**
 * Cash (Phase 18): cash book quick entry and cash ledger, daily cash count / day close, petty cash vouchers and top-ups,
 * expense claims (finance and My Profile). Registered before TreasuryModule so its /cash/... routes win over that
 * module's generic /cash/:resource/:id/:action routes.
 */
@Module({
  imports: [LedgerModule, BankingModule, ApprovalsModule],
  controllers: [CashBookController, DayClosesController, PettyController, ExpenseClaimsController, MyExpenseClaimsController],
  providers: [
    CashBookService, { provide: CashBookStore, useClass: PrismaCashBookStore },
    DayClosesService, { provide: DayCloseStore, useClass: PrismaDayCloseStore },
    PettyService, { provide: PettyStore, useClass: PrismaPettyStore },
    ExpenseClaimsService, { provide: ClaimStore, useClass: PrismaClaimStore },
  ],
})
export class CashModule {}
