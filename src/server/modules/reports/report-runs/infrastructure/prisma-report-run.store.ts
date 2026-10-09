import { Injectable } from '@nestjs/common';
import type { ReportRun } from '../../../../../shared/index.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { ids, userRefs } from '../../../banking/transactions/infrastructure/banking-refs.js';
import { ReportRunStore } from '../application/report-runs.service.js';

@Injectable()
export class PrismaReportRunStore extends ReportRunStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async start(data: { tenantId: string; reportId: string; title: string; format: string; parameters: unknown; runByUserId: string }) {
    return (await this.prisma.db().reportRuns.create({
      data: { tenantId: data.tenantId, reportId: data.reportId, title: data.title.slice(0, 200), format: data.format, parameters: data.parameters as never, triggerType: 'MANUAL', runByUserId: data.runByUserId, status: 'RUNNING' },
      select: { id: true },
    })).id;
  }

  async finish(tenantId: string, id: string, data: { status: 'COMPLETED' | 'FAILED'; rowCount: number | null; outputAttachmentId: string | null; errorMessage: string | null }) {
    await this.prisma.db().reportRuns.updateMany({ where: { tenantId, id }, data: { ...data, finishedAt: new Date() } });
  }

  async list(tenantId: string, q: { reportId?: string; userId?: string; page: number; pageSize: number }) {
    const db = this.prisma.db();
    const where = { tenantId, ...(q.reportId && { reportId: q.reportId }), ...(q.userId && { runByUserId: q.userId }) };
    const [rows, total] = await Promise.all([
      db.reportRuns.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.reportRuns.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().reportRuns.findFirst({ where: { tenantId, id } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async isRunOutput(tenantId: string, attachmentId: string) {
    return (await this.prisma.db().reportRuns.count({ where: { tenantId, outputAttachmentId: attachmentId } })) > 0;
  }

  private async map(tenantId: string, rows: Awaited<ReturnType<PrismaService['reportRuns']['findMany']>>): Promise<ReportRun[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [users, reports] = await Promise.all([
      userRefs(db, tenantId, rows.map((r) => r.runByUserId)),
      db.savedReports.findMany({ where: { tenantId, id: { in: ids(rows.map((r) => r.reportId)) } }, select: { id: true, name: true } }),
    ]);
    return rows.map((r) => ({
      id: r.id, report: reports.find((x) => x.id === r.reportId) ?? null, title: r.title, format: r.format, triggerType: r.triggerType, status: r.status, rowCount: r.rowCount,
      runBy: users.get(r.runByUserId ?? '') ?? null, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, errorMessage: r.errorMessage,
      outputAttachmentId: r.outputAttachmentId,
    }));
  }
}
