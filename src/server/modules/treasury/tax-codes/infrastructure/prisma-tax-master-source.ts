import { Injectable } from '@nestjs/common';
import type { SalesTaxRate, WithholdingRate } from '../../../../../shared/index.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { TaxMasterSource } from '../application/tax-master-import.service.js';

const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Reads the published Platform tax master (no tenant data) and the company's default account mappings. */
@Injectable()
export class PrismaTaxMasterSource extends TaxMasterSource {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async salesTax(): Promise<SalesTaxRate[]> {
    const db = this.prisma.db();
    const [rows, auth] = await Promise.all([
      db.taxMasterSalesTaxRates.findMany({ where: { publishedAt: { not: null }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today() } }] }, orderBy: { effectiveFrom: 'asc' } }),
      db.taxMasterAuthorities.findMany({ select: { id: true, code: true, jurisdiction: true } }),
    ]);
    return rows.map((r) => {
      const a = auth.find((x) => x.id === r.taxAuthorityId);
      return {
        id: r.id, taxAuthorityId: r.taxAuthorityId, authorityCode: a?.code ?? 'TAX', jurisdiction: a?.jurisdiction ?? '', appliesTo: r.appliesTo, rate: r.rate.toNumber(),
        reducedRatesNote: r.reducedRatesNote, effectiveFrom: day(r.effectiveFrom)!, effectiveTo: day(r.effectiveTo), status: r.status,
        legalReference: r.legalReference, masterVersion: r.masterVersion, publishedAt: r.publishedAt?.toISOString() ?? null, rowVersion: r.rowVersion,
      };
    });
  }

  async withholding(): Promise<WithholdingRate[]> {
    const rows = await this.prisma.db().taxMasterWithholdingRates.findMany({
      where: { publishedAt: { not: null }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today() } }] }, orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id, sectionCode: r.sectionCode, nature: r.nature, atlRateCompany: num(r.atlRateCompany), atlRateOther: num(r.atlRateOther),
      nonAtlRateCompany: num(r.nonAtlRateCompany), nonAtlRateOther: num(r.nonAtlRateOther), rateNote: r.rateNote, thresholdAmount: num(r.thresholdAmount),
      thresholdNote: r.thresholdNote, usesSalarySlabs: r.usesSalarySlabs, effectiveFrom: day(r.effectiveFrom)!, effectiveTo: day(r.effectiveTo),
      status: r.status, legalReference: r.legalReference, masterVersion: r.masterVersion, publishedAt: r.publishedAt?.toISOString() ?? null, rowVersion: r.rowVersion,
    }));
  }

  async defaultAccounts(tenantId: string) {
    const rows = await this.prisma.db().defaultAccountMappings.findMany({ where: { tenantId }, select: { role: true, accountId: true } });
    return new Map(rows.map((r) => [r.role, r.accountId]));
  }
}
