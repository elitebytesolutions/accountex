import { Injectable } from '@nestjs/common';
import type { Announcement, AnnouncementOptions, MyAnnouncement } from '../../../../../shared/self-service/announcement.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { AnnouncementStore, type EmployeePlacement } from '../application/announcement-store.js';

type Row = Awaited<ReturnType<ReturnType<PrismaService['db']>['companyAnnouncements']['findMany']>>[number];
const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class PrismaAnnouncementStore extends AnnouncementStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async map(tenantId: string, rows: Row[]): Promise<Announcement[]> {
    const db = this.prisma.db();
    const ids = (k: 'branchId' | 'departmentId' | 'policyDocumentId') => [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))];
    const [branches, departments, policies] = await Promise.all([
      db.branches.findMany({ where: { tenantId, id: { in: ids('branchId') } }, select: { id: true, name: true } }),
      db.departments.findMany({ where: { tenantId, id: { in: ids('departmentId') } }, select: { id: true, name: true } }),
      db.companyPolicies.findMany({ where: { tenantId, id: { in: ids('policyDocumentId') } }, select: { id: true, title: true } }),
    ]);
    const now = Date.now();
    return rows.map((a) => ({
      id: a.id, title: a.title, summary: a.summary, body: a.body, kind: a.kind, authorEmployeeId: a.authorEmployeeId, authorLabel: a.authorLabel,
      eventAt: iso(a.eventAt), venue: a.venue, requiresRsvp: a.requiresRsvp,
      branch: branches.find((b) => b.id === a.branchId) ?? null,
      department: departments.find((d) => d.id === a.departmentId) ?? null,
      policy: policies.find((p) => p.id === a.policyDocumentId) ?? null,
      isPinned: a.isPinned, status: a.status, publishedAt: iso(a.publishedAt), expiresAt: iso(a.expiresAt),
      isExpired: a.status === 'PUBLISHED' && !!a.expiresAt && a.expiresAt.getTime() <= now,
      createdAt: a.createdAt.toISOString(), rowVersion: a.rowVersion,
    }));
  }

  async list(tenantId: string, status?: string) {
    const rows = await this.prisma.db().companyAnnouncements.findMany({
      where: { tenantId, ...(status && { status }) },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return this.map(tenantId, rows);
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().companyAnnouncements.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async options(tenantId: string): Promise<AnnouncementOptions> {
    const db = this.prisma.db();
    const [branches, departments, policies] = await Promise.all([
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.departments.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.companyPolicies.findMany({ where: { tenantId, deletedAt: null, status: 'PUBLISHED' }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    ]);
    return { branches, departments, policies };
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) === 1;
  }

  async activeDepartment(tenantId: string, id: string) {
    return (await this.prisma.db().departments.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) === 1;
  }

  async policyExists(tenantId: string, id: string) {
    return (await this.prisma.db().companyPolicies.count({ where: { tenantId, id, deletedAt: null } })) === 1;
  }

  async activeEmployee(tenantId: string, id: string) {
    return (await this.prisma.db().employees.count({ where: { tenantId, id, deletedAt: null, status: { not: 'EXITED' } } })) === 1;
  }

  save(data: Record<string, unknown>) {
    const { reads: _never, ...rest } = data;
    void _never;
    return addUpdate(this.prisma, 'companyAnnouncementAddUpdate', rest);
  }

  async setState(tenantId: string, id: string, rowVersion: number, data: { status?: string; publishedAt?: Date; expiresAt?: Date | null; isPinned?: boolean }) {
    const { count } = await this.prisma.db().companyAnnouncements.updateMany({ where: { tenantId, id, rowVersion }, data });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this announcement. Reload and try again.');
  }

  async placement(tenantId: string, userId: string): Promise<EmployeePlacement> {
    const e = await this.prisma.db().employees.findFirst({ where: { tenantId, appUserId: userId, deletedAt: null }, select: { branchId: true, departmentId: true } });
    return e ?? null;
  }

  async feed(tenantId: string, placement: EmployeePlacement, now: Date): Promise<MyAnnouncement[]> {
    const rows = await this.prisma.db().companyAnnouncements.findMany({
      where: {
        tenantId, status: 'PUBLISHED', publishedAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ branchId: null }, ...(placement ? [{ branchId: placement.branchId }] : [])] },
          { OR: [{ departmentId: null }, ...(placement ? [{ departmentId: placement.departmentId }] : [])] },
        ],
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: 30,
    });
    return (await this.map(tenantId, rows)).map((a) => ({
      id: a.id, title: a.title, summary: a.summary, body: a.body, kind: a.kind, authorLabel: a.authorLabel, eventAt: a.eventAt, venue: a.venue,
      requiresRsvp: a.requiresRsvp, isPinned: a.isPinned, publishedAt: a.publishedAt, expiresAt: a.expiresAt, branch: a.branch?.name ?? null, department: a.department?.name ?? null,
    }));
  }
}
