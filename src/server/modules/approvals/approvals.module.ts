import { Module } from '@nestjs/common';
import { ApprovalStore } from './application/approval-store.js';
import { ApprovalSubjects } from './application/approval-subjects.js';
import { ApprovalsService } from './application/approvals.service.js';
import { PrismaApprovalStore } from './infrastructure/prisma-approval.store.js';
import { ApprovalsController } from './presentation/approvals.controller.js';

/**
 * The approval engine and inbox (Phase 16). Document modules import this module and register an ApprovalSubject
 * (vouchers now; bills, payments, leave… later) with ApprovalSubjects.
 */
@Module({
  controllers: [ApprovalsController],
  providers: [ApprovalsService, ApprovalSubjects, { provide: ApprovalStore, useClass: PrismaApprovalStore }],
  exports: [ApprovalsService, ApprovalSubjects],
})
export class ApprovalsModule {}
