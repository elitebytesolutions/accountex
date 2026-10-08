import { Injectable } from '@nestjs/common';
import type { CommTemplate } from '../../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../../infrastructure/prisma/references.js';
import { CommTemplateStore } from '../application/comm-template-store.js';

@Injectable()
export class PrismaCommTemplateStore extends CommTemplateStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<CommTemplate[]> {
    const db = this.prisma.db();
    const [rows, sent] = await Promise.all([
      db.communicationTemplates.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
      db.$queryRaw<{ id: string; n: bigint }[]>`
        select "commTemplateId"::text as id, count(*) as n from "Platform"."CommunicationLogs"
         where "commTemplateId" is not null and not "isTest" and "createdAt" >= now() - interval '30 days' group by 1`,
    ]);
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, icon: r.icon, channels: r.channels, subjectEn: r.subjectEn, bodyEn: r.bodyEn,
      subjectUr: r.subjectUr, bodyUr: r.bodyUr, version: r.version, isActive: r.isActive,
      sent30d: Number(sent.find((s) => s.id === r.id)?.n ?? 0), updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
    }));
  }

  allCodes() {
    return this.prisma.db().communicationTemplates.findMany({ select: { id: true, code: true } });
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'communicationTemplateAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'communicationTemplates', id);
  }

  async remove(id: string, rowVersion: number) {
    const { count } = await this.prisma.db().communicationTemplates.deleteMany({ where: { id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this template. Reload and try again.');
  }
}
