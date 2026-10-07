import { Injectable } from '@nestjs/common';
import type { DocumentType, NumberingSeries } from '../../../../../shared/index.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { NumberingStore } from '../application/numbering-store.js';

type Row = Omit<NumberingSeries, 'startValue' | 'nextValue'> & { startValue: bigint; nextValue: bigint };

@Injectable()
export class PrismaNumberingStore extends NumberingStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Company.getNumberingSeriesPreview gives the number the next document will get; inUse = any counter exists. */
  private async query(tenantId: string, id?: string): Promise<NumberingSeries[]> {
    const rows = await this.prisma.db().$queryRaw<Row[]>`
      select p."sequenceId"::text as id, p."docType", p."docTypeName", p."docTypeModule", p."branchId"::text as "branchId",
             p."branchCode", p.prefix, p.pattern, p.padding, p."startValue", p."resetPolicy", p."isActive", p."nextValue", p.preview,
             exists (select 1 from "Company"."NumberingSeriesCounters" c where c."tenantId" = p."tenantId" and c."sequenceId" = p."sequenceId") as "inUse",
             s."rowVersion"
      from "Company"."getNumberingSeriesPreview" p
      join "Company"."NumberingSeries" s on s.id = p."sequenceId"
      where p."tenantId" = ${tenantId}::uuid ${id ? Prisma.sql`and p."sequenceId" = ${id}::uuid` : Prisma.empty}
      order by p."docTypeModule", p."docTypeName", p."branchCode" nulls first`;
    return rows.map((r) => ({ ...r, startValue: Number(r.startValue), nextValue: Number(r.nextValue) }));
  }

  list(tenantId: string) {
    return this.query(tenantId);
  }

  async get(tenantId: string, id: string) {
    return (await this.query(tenantId, id))[0] ?? null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'numberingSeriesAddUpdate', data);
  }

  async delete(tenantId: string, id: string) {
    const { count } = await this.prisma.db().numberingSeries.deleteMany({ where: { id, tenantId } });
    return count === 1;
  }

  documentTypes(): Promise<DocumentType[]> {
    return this.prisma.db().documentTypes.findMany({
      where: { isActive: true },
      select: { code: true, name: true, module: true, defaultPrefix: true, defaultPattern: true, defaultPadding: true, defaultResetPolicy: true },
      orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }],
    });
  }
}
