import { Injectable } from '@nestjs/common';
import type { SessionUser, WorkspaceDashboard } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ApprovalsService } from '../../../approvals/application/approvals.service.js';
import { WorkStore } from '../../common/application/work-store.js';

/**
 * Workspace dashboard (template app/dashboard): cash and bank balance, this month's revenue and expenses, twelve months
 * of income against expense, the current budget, recent receipts and payments, my pending approvals and the latest
 * payroll run, all from posted data.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly store: WorkStore, private readonly approvals: ApprovalsService, private readonly unitOfWork: UnitOfWork) {}

  async get(user: SessionUser, meta: RequestMeta): Promise<WorkspaceDashboard> {
    const today = await this.store.companyToday(user.tenantId);
    const [d, inbox] = await this.unitOfWork.run(actorContext(user, meta), () => Promise.all([this.store.dashboard(user.tenantId, today), this.approvals.inbox(user)]));
    return {
      ...d,
      approvals: {
        count: inbox.items.length,
        items: inbox.items.slice(0, 5).map((i) => ({ id: i.id, docLabel: i.docLabel, title: i.title, requestedBy: i.requestedBy?.name ?? null, amount: i.amount, href: i.link || '/approvals' })),
      },
    };
  }
}
