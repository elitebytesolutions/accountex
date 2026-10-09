import { Module } from '@nestjs/common';
import { BudgetStore } from './budgets/application/budget-store.js';
import { BudgetsService } from './budgets/application/budgets.service.js';
import { PrismaBudgetStore } from './budgets/infrastructure/prisma-budget.store.js';
import { BudgetsController } from './budgets/presentation/budgets.controller.js';

/** Budgeting (Phase 27): versioned budgets by account × month, submitted / approved, and budget vs actual. */
@Module({
  controllers: [BudgetsController],
  providers: [{ provide: BudgetStore, useClass: PrismaBudgetStore }, BudgetsService],
})
export class BudgetsModule {}
