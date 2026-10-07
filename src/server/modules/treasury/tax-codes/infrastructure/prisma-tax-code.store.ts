import { Injectable } from '@nestjs/common';
import type { TaxCode, TaxCodeRate } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { TaxCodeStore, type TaxCodeData } from '../application/tax-code-store.js';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class PrismaTaxCodeStore extends TaxCodeStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<TaxCode[]> {
    const db = this.prisma.db();
    const [codes, rates] = await Promise.all([
      db.taxCodes.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } }),
      db.taxCodeRates.findMany({ where: { tenantId }, orderBy: { effectiveFrom: 'asc' } }),
    ]);
    const ids = [...new Set(codes.flatMap((c) => [c.accountId, c.inputAccountId]).filter((x): x is string => !!x))];
    const accounts = await db.chartOfAccounts.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, code: true, name: true } });
    const ref = (id: string | null) => (id ? (accounts.find((a) => a.id === id) ?? null) : null);
    const today = new Date().toISOString().slice(0, 10);
    return codes.map((c) => {
      const own: TaxCodeRate[] = rates
        .filter((r) => r.taxCodeId === c.id)
        .map((r) => ({
          id: r.id, effectiveFrom: day(r.effectiveFrom)!, effectiveTo: day(r.effectiveTo), rate: r.rate?.toNumber() ?? null,
          nonAtlRate: r.nonAtlRate?.toNumber() ?? null, financeAct: r.financeAct, remarks: r.remarks,
        }));
      return {
        id: c.id, code: c.code, description: c.description, taxType: c.taxType, appliesTo: c.appliesTo, rateBasis: c.rateBasis,
        salesTaxKind: c.salesTaxKind, whtSection: c.whtSection, whtNature: c.whtNature, account: ref(c.accountId), inputAccount: ref(c.inputAccountId),
        fbrReference: c.fbrReference, calcOnExclSalesTax: c.calcOnExclSalesTax, checkAtl: c.checkAtl, isSystem: c.isSystem, isActive: c.isActive,
        currentRate: own.find((r) => r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today)) ?? null,
        rates: own, rowVersion: c.rowVersion,
      };
    });
  }

  async get(tenantId: string, id: string) {
    return (await this.list(tenantId)).find((t) => t.id === id) ?? null;
  }

  async retiredCodes(tenantId: string) {
    return (await this.prisma.db().taxCodes.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { code: true } })).map((r) => r.code);
  }

  save(data: TaxCodeData) {
    return addUpdate(this.prisma, 'taxCodeAddUpdate', data);
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'taxCodes', id, ['taxCodeRates']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().taxCodes.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this tax code. Reload and try again.');
  }
}
