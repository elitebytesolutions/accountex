import { Injectable } from '@nestjs/common';
import type { DunningPolicy, RetryStep } from '../../../../../../shared/index.js';
import type { DunningPolicies } from '../../../../../generated/prisma/client.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { DunningPolicyStore } from '../application/dunning-policy-store.js';

@Injectable()
export class PrismaDunningPolicyStore extends DunningPolicyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list() {
    const rows = await this.prisma.db().dunningPolicies.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
    return this.map(rows);
  }

  async get(id: string) {
    const row = await this.prisma.db().dunningPolicies.findUnique({ where: { id } });
    return row ? (await this.map([row]))[0]! : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'dunningPolicyAddUpdate', data);
  }

  async deactivateOthers(id: string) {
    await this.prisma.db().dunningPolicies.updateMany({ where: { isActive: true, id: { not: id } }, data: { isActive: false } });
  }

  async remove(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().dunningPolicies.deleteMany({ where: { id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this policy. Reload and try again.');
  }

  private async map(rows: DunningPolicies[]): Promise<DunningPolicy[]> {
    if (!rows.length) return [];
    // Platform.DunningCases belongs to Phase 41 (not mapped): counted with SQL.
    const counts = await this.prisma.db().$queryRaw<{ id: string; n: bigint }[]>`
      select "dunningPolicyId"::text as id, count(*) as n from "Platform"."DunningCases"
       where "dunningPolicyId" = any(${rows.map((r) => r.id)}::uuid[]) group by "dunningPolicyId"`;
    const n = new Map(counts.map((c) => [c.id, Number(c.n)]));
    return rows.map((r) => ({
      id: r.id, name: r.name, isActive: r.isActive, graceDays: r.graceDays, readOnlyDays: r.readOnlyDays, suspendedDays: r.suspendedDays,
      archiveDays: r.archiveDays, retryHour: r.retryHour, salaryRetryDays: r.salaryRetryDays,
      retrySchedule: (Array.isArray(r.retrySchedule) ? r.retrySchedule : []) as RetryStep[],
      emailEnabled: r.emailEnabled, emailOffsets: r.emailOffsets, smsEnabled: r.smsEnabled, smsOffsets: r.smsOffsets,
      whatsappEnabled: r.whatsappEnabled, whatsappOffsets: r.whatsappOffsets, effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      casesCount: n.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }
}
