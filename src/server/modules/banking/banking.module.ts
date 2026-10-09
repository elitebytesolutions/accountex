import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ChequeStore } from './cheques/application/cheque-store.js';
import { ChequeBatchesService } from './cheques/application/cheque-batches.service.js';
import { ChequesService } from './cheques/application/cheques.service.js';
import { PrismaChequeStore } from './cheques/infrastructure/prisma-cheque.store.js';
import { ChequeBatchesController, ChequesController } from './cheques/presentation/cheques.controller.js';
import { ReconStore } from './reconciliations/application/recon-store.js';
import { ReconciliationsService } from './reconciliations/application/reconciliations.service.js';
import { PrismaReconStore } from './reconciliations/infrastructure/prisma-recon.store.js';
import { ReconciliationsController } from './reconciliations/presentation/reconciliations.controller.js';
import { StatementStore } from './statements/application/statement-store.js';
import { StatementImportsService } from './statements/application/statement-imports.service.js';
import { PrismaStatementStore } from './statements/infrastructure/prisma-statement.store.js';
import { StatementImportsController } from './statements/presentation/statement-imports.controller.js';
import { BankTxnStore } from './transactions/application/bank-txn-store.js';
import { BankTransactionsService } from './transactions/application/bank-transactions.service.js';
import { PrismaBankTxnStore } from './transactions/infrastructure/prisma-bank-txn.store.js';
import { BankTransactionsController } from './transactions/presentation/bank-transactions.controller.js';

/** Banking (Phase 17): bank transactions, statement imports, bank reconciliation, cheques and bulk cheque vouchers. */
@Module({
  imports: [LedgerModule],
  controllers: [BankTransactionsController, StatementImportsController, ReconciliationsController, ChequesController, ChequeBatchesController],
  providers: [
    BankTransactionsService, { provide: BankTxnStore, useClass: PrismaBankTxnStore },
    StatementImportsService, { provide: StatementStore, useClass: PrismaStatementStore },
    ReconciliationsService, { provide: ReconStore, useClass: PrismaReconStore },
    ChequesService, ChequeBatchesService, { provide: ChequeStore, useClass: PrismaChequeStore },
  ],
  exports: [ChequesService, BankTransactionsService],
})
export class BankingModule {}
