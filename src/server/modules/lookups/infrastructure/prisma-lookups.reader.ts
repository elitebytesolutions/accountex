import { Injectable } from '@nestjs/common';
import type { LookupsResponse } from '../../../../shared/index.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { LookupsReader } from '../application/lookups-reader.js';

@Injectable()
export class PrismaLookupsReader extends LookupsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byTypes(types: string[], tenantId: string): Promise<LookupsResponse> {
    const rows = await this.prisma.lookups.findMany({
      where: { lookupType: { in: types }, isActive: true, OR: [{ tenantId: null }, { tenantId }] },
      select: { lookupType: true, code: true, label: true, tone: true, parentCodes: true },
      orderBy: [{ lookupType: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    const out: LookupsResponse = Object.fromEntries(types.map((t) => [t, []]));
    for (const r of rows) out[r.lookupType]!.push({ code: r.code, label: r.label, tone: r.tone, ...(r.parentCodes.length ? { parentCodes: r.parentCodes } : {}) });
    return out;
  }
}
