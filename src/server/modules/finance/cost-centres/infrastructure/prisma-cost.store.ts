import { Injectable } from '@nestjs/common';
import type { AllocationRule, AllocationRuleSave, CostCentre, CostCentreCreate, Project, ProjectCreate } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { CostStore } from '../application/cost-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaCostStore extends CostStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async retiredCodes(tenantId: string, kind: 'centre' | 'project') {
    const where = { tenantId, deletedAt: { not: null } };
    const rows = kind === 'centre'
      ? await this.prisma.db().costCentres.findMany({ where, select: { code: true } })
      : await this.prisma.db().projects.findMany({ where, select: { code: true } });
    return rows.map((r) => r.code);
  }

  async centres(tenantId: string): Promise<CostCentre[]> {
    const rows = await this.prisma.db().costCentres.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } });
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, parentId: c.parentCostCentreId, branchId: c.branchId, centreType: c.centreType,
      annualBudget: c.annualBudget?.toNumber() ?? null, tags: c.tags, status: c.status, rowVersion: c.rowVersion,
    }));
  }

  saveCentre(data: Partial<CostCentreCreate> & { id?: string; rowVersion?: number; status?: string }) {
    const { parentId, ...rest } = data;
    return addUpdate(this.prisma, 'costCentreAddUpdate', { ...rest, ...(parentId !== undefined && { parentCostCentreId: parentId }) });
  }

  async deleteCentre(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().costCentres.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this cost centre. Reload and try again.');
  }

  async projects(tenantId: string): Promise<Project[]> {
    const db = this.prisma.db();
    const [rows, tags] = await Promise.all([
      db.projects.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.projectTags.findMany({ where: { tenantId }, select: { projectId: true, tag: true } }),
    ]);
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, budgetAmount: p.budgetAmount.toNumber(), expectedRevenue: p.expectedRevenue.toNumber(),
      startDate: day(p.startDate), endDate: day(p.endDate), colour: p.colour, status: p.status,
      tags: tags.filter((t) => t.projectId === p.id).map((t) => t.tag).sort(), rowVersion: p.rowVersion,
    }));
  }

  async saveProject(tenantId: string, data: Partial<ProjectCreate> & { id?: string; rowVersion?: number }) {
    const { tags, ...fields } = data;
    const payload: Record<string, unknown> = { ...fields };
    if (tags) {
      const current = data.id ? await this.prisma.db().projectTags.findMany({ where: { tenantId, projectId: data.id }, select: { id: true, tag: true } }) : [];
      payload.tags = [
        ...current.filter((t) => tags.includes(t.tag)).map((t) => ({ id: t.id })),
        ...[...new Set(tags)].filter((t) => !current.some((c) => c.tag === t)).map((tag) => ({ tag })),
      ];
    }
    return addUpdate(this.prisma, 'projectAddUpdate', payload);
  }

  async deleteProject(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().projects.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this project. Reload and try again.');
  }

  async rules(tenantId: string): Promise<AllocationRule[]> {
    const db = this.prisma.db();
    const [rows, splits] = await Promise.all([
      db.costAllocationRules.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      db.costAllocationSplits.findMany({ where: { tenantId }, select: { allocationRuleId: true, costCentreId: true, percent: true } }),
    ]);
    const accounts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: rows.map((r) => r.accountId) } }, select: { id: true, code: true, name: true } });
    return rows.map((r) => {
      const a = accounts.find((x) => x.id === r.accountId);
      return {
        id: r.id, name: r.name, accountId: r.accountId, accountCode: a?.code ?? '', accountName: a?.name ?? '', basis: r.basis, tags: r.tags,
        status: r.status, rowVersion: r.rowVersion,
        splits: splits.filter((s) => s.allocationRuleId === r.id).map((s) => ({ costCentreId: s.costCentreId, percent: s.percent.toNumber() })),
      };
    });
  }

  saveRule(data: AllocationRuleSave & { id?: string; rowVersion?: number }) {
    return addUpdate(this.prisma, 'costAllocationRuleAddUpdate', { ...data, splits: data.splits.map((s) => ({ costCentreId: s.costCentreId, percent: s.percent })) });
  }

  async deleteRule(tenantId: string, id: string) {
    await this.prisma.db().costAllocationRules.deleteMany({ where: { tenantId, id } });
  }

  async postableAccount(tenantId: string, id: string) {
    return (await this.prisma.db().chartOfAccounts.count({ where: { tenantId, id, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null } })) === 1;
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) === 1;
  }
}
