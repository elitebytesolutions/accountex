import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { ListResult, TalentListQuery, TrainingProgram } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { TrainingProgramStore } from '../application/training-program-store.js';

type Row = Prisma.TrainingProgramsGetPayload<object>;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaTrainingProgramStore extends TrainingProgramStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: TalentListQuery): Promise<ListResult<TrainingProgram>> {
    const s = q.search?.trim();
    const where: Prisma.TrainingProgramsWhereInput = {
      tenantId, deletedAt: null, ...(q.status && { status: q.status }),
      ...(s && { OR: [{ name: { contains: s, mode: 'insensitive' } }, { code: { contains: s, mode: 'insensitive' } }, { audience: { contains: s, mode: 'insensitive' } }, { provider: { contains: s, mode: 'insensitive' } }] }),
    };
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([
      db.trainingPrograms.findMany({ where, orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.trainingPrograms.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().trainingPrograms.findFirst({ where: { tenantId, id, deletedAt: null } });
    return row ? (await this.map(tenantId, [row]))[0]! : null;
  }

  async allNames(tenantId: string) {
    const rows = await this.prisma.db().trainingPrograms.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, deleted: r.deletedAt !== null }));
  }

  async activeDepartment(tenantId: string, id: string) {
    return (await this.prisma.db().departments.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'trainingProgramAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'trainingPrograms', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().trainingPrograms.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this program. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<TrainingProgram[]> {
    if (!rows.length) return [];
    const depIds = [...new Set(rows.map((r) => r.departmentId).filter((x): x is string => !!x))];
    const deps = depIds.length ? await this.prisma.db().departments.findMany({ where: { tenantId, id: { in: depIds } }, select: { id: true, code: true, name: true } }) : [];
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, audience: r.audience, department: deps.find((d) => d.id === r.departmentId) ?? null,
      format: r.format, durationLabel: r.durationLabel, durationHours: r.durationHours?.toNumber() ?? null, provider: r.provider,
      isMandatory: r.isMandatory, isCpdCertified: r.isCpdCertified, seats: r.seats, targetParticipants: r.targetParticipants,
      budget: r.budget?.toNumber() ?? null, costPerHead: r.costPerHead?.toNumber() ?? null,
      grantsCertification: r.grantsCertification, certificationValidityMonths: r.certificationValidityMonths,
      startDate: day(r.startDate), endDate: day(r.endDate), status: r.status, description: r.description, rowVersion: r.rowVersion,
    }));
  }
}
