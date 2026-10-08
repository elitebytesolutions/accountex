import { Injectable } from '@nestjs/common';
import { effectiveStatus, type SalarySlab, type SalesTaxRate, type TaxAuthority, type WithholdingRate } from '../../../../../../shared/index.js';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import type { Sealed } from '../../../../../core/application/ports/secret-box.js';
import { ConcurrencyError } from '../../../../../core/domain/errors.js';
import { addUpdate } from '../../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../../infrastructure/prisma/prisma.service.js';
import { TaxMasterStore, type RateKind } from '../application/tax-master-store.js';
import { readPlatformLog } from '../../infrastructure/platform-log.js';

const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const today = () => new Date().toISOString().slice(0, 10);
const TAX_TABLES = ['TaxMasterAuthorities', 'TaxMasterSalesTaxRates', 'TaxMasterWithholdingRates', 'TaxMasterSalarySlabs'];

@Injectable()
export class PrismaTaxMasterStore extends TaxMasterStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async authorities(): Promise<TaxAuthority[]> {
    const rows = await this.prisma.db().taxMasterAuthorities.findMany({ omit: { apiTokenEnc: true } });
    const order = ['FBR', 'PRA', 'SRB', 'KPRA', 'BRA'];
    const hasToken = await this.prisma.db().taxMasterAuthorities.findMany({ where: { apiTokenEnc: { not: null } }, select: { id: true } });
    return rows
      .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))
      .map((r) => ({
        id: r.id, code: r.code, name: r.name, jurisdiction: r.jurisdiction, levyScope: r.levyScope,
        sandboxEndpoint: r.sandboxEndpoint, productionEndpoint: r.productionEndpoint, activeEnvironment: r.activeEnvironment,
        hasToken: hasToken.some((h) => h.id === r.id), tokenLast4: r.apiTokenLast4, platformPosId: r.platformPosId,
        timeoutSeconds: r.timeoutSeconds, onFailure: r.onFailure, lastTestAt: iso(r.lastTestAt), lastTestOk: r.lastTestOk, lastTestMs: r.lastTestMs,
        rowVersion: r.rowVersion,
      }));
  }

  async salesTax(): Promise<SalesTaxRate[]> {
    const db = this.prisma.db();
    const [rows, auth] = await Promise.all([
      db.taxMasterSalesTaxRates.findMany({ orderBy: [{ effectiveFrom: 'asc' }] }),
      db.taxMasterAuthorities.findMany({ select: { id: true, code: true, jurisdiction: true } }),
    ]);
    const t = today();
    return rows.map((r) => {
      const a = auth.find((x) => x.id === r.taxAuthorityId);
      const from = day(r.effectiveFrom)!, to = day(r.effectiveTo);
      return {
        id: r.id, taxAuthorityId: r.taxAuthorityId, authorityCode: a?.code ?? '', jurisdiction: a?.jurisdiction ?? '', appliesTo: r.appliesTo,
        rate: r.rate.toNumber(), reducedRatesNote: r.reducedRatesNote, effectiveFrom: from, effectiveTo: to, status: effectiveStatus(from, to, t),
        legalReference: r.legalReference, masterVersion: r.masterVersion, publishedAt: iso(r.publishedAt), rowVersion: r.rowVersion,
      };
    });
  }

  async withholding(): Promise<WithholdingRate[]> {
    const rows = await this.prisma.db().taxMasterWithholdingRates.findMany({ orderBy: [{ sectionCode: 'asc' }, { effectiveFrom: 'asc' }] });
    const t = today();
    return rows.map((r) => {
      const from = day(r.effectiveFrom)!, to = day(r.effectiveTo);
      return {
        id: r.id, sectionCode: r.sectionCode, nature: r.nature, atlRateCompany: num(r.atlRateCompany), atlRateOther: num(r.atlRateOther),
        nonAtlRateCompany: num(r.nonAtlRateCompany), nonAtlRateOther: num(r.nonAtlRateOther), rateNote: r.rateNote,
        thresholdAmount: num(r.thresholdAmount), thresholdNote: r.thresholdNote, usesSalarySlabs: r.usesSalarySlabs,
        effectiveFrom: from, effectiveTo: to, status: effectiveStatus(from, to, t), legalReference: r.legalReference,
        masterVersion: r.masterVersion, publishedAt: iso(r.publishedAt), rowVersion: r.rowVersion,
      };
    });
  }

  async slabs(): Promise<SalarySlab[]> {
    const rows = await this.prisma.db().taxMasterSalarySlabs.findMany({ orderBy: [{ taxYear: 'desc' }, { slabNo: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, taxYear: r.taxYear, slabNo: r.slabNo, incomeFrom: r.incomeFrom.toNumber(), incomeTo: num(r.incomeTo), fixedTax: r.fixedTax.toNumber(),
      ratePct: r.ratePct.toNumber(), excessOver: r.excessOver.toNumber(), legalReference: r.legalReference, rowVersion: r.rowVersion,
    }));
  }

  /** Payroll.SalaryTaxSlabs is tenant data under row security: Company.isReferenced (SECURITY DEFINER) checks the FK for every tenant. */
  async slabImports(): Promise<Map<number, number>> {
    const rows = await this.prisma.db().$queryRaw<{ taxYear: number; n: bigint }[]>`
      select m."taxYear"::int as "taxYear", count(*) as n from "Platform"."TaxMasterSalarySlabs" m
       where "Company"."isReferenced"('"Platform"."TaxMasterSalarySlabs"'::regclass, m.id, '{}'::regclass[])
       group by m."taxYear"`;
    return new Map(rows.map((r) => [r.taxYear, Number(r.n)]));
  }

  schedule(kind: RateKind, data: Record<string, unknown>) {
    return addUpdate(this.prisma, kind === 'sales-tax' ? 'taxMasterSalesTaxRateSchedule' : 'taxMasterWithholdingRateSchedule', data);
  }

  saveRate(kind: RateKind, data: Record<string, unknown>) {
    return addUpdate(this.prisma, kind === 'sales-tax' ? 'taxMasterSalesTaxRateAddUpdate' : 'taxMasterWithholdingRateAddUpdate', data);
  }

  async deleteRate(kind: RateKind, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const where = { id, rowVersion, publishedAt: null };
    const { count } = kind === 'sales-tax' ? await db.taxMasterSalesTaxRates.deleteMany({ where }) : await db.taxMasterWithholdingRates.deleteMany({ where });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this rate. Reload and try again.');
  }

  saveAuthority(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'taxMasterAuthorityAddUpdate', data);
  }

  async authorityToken(id: string): Promise<Sealed | null> {
    const row = await this.prisma.db().taxMasterAuthorities.findUnique({ where: { id }, select: { apiTokenEnc: true } });
    return row?.apiTokenEnc ? (JSON.parse(Buffer.from(row.apiTokenEnc).toString('utf8')) as Sealed) : null;
  }

  async replaceSlabs(taxYear: number, slabs: Record<string, unknown>[]) {
    await this.prisma.db().taxMasterSalarySlabs.deleteMany({ where: { taxYear } });
    for (const s of slabs) await addUpdate(this.prisma, 'taxMasterSalarySlabAddUpdate', s);
  }

  log(limit: number, offset: number) {
    return readPlatformLog(this.prisma, { tables: TAX_TABLES, limit, offset });
  }
}
