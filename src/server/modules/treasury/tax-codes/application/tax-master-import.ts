import type { SalesTaxRate, WithholdingRate } from '../../../../../shared/index.js';

/**
 * Phase 37 · "Import from Tax Master" (pure mapping): a published tax-master row becomes a company tax code with a
 * dated rate. One code per master lineage, so a later rate change adds a rate period to the same code:
 *   sales tax  (authority + "applies to") → ST-<AUTH>[-n]  (FT-<AUTH>[-n] for further tax)
 *   withholding (section)                 → WHT-<section>   (ADV-<section> for 236 advance tax, a collection)
 * Section 149 (salary slabs) is imported into Payroll › Tax slabs instead.
 */
export type ImportedCode = {
  code: string;
  description: string;
  taxType: string;
  appliesTo: string;
  salesTaxKind: string | null;
  whtSection: string | null;
  whtNature: string | null;
  /** Posting roles (Company.DefaultAccountMappings) for the tax account and, for sales tax, the input account. */
  accountRoles: string[];
  inputAccountRoles: string[] | null;
  checkAtl: boolean;
  fbrReference: string | null;
  rate: { effectiveFrom: string; effectiveTo: string | null; rate: number | null; nonAtlRate: number | null; financeAct: string | null; remarks: string | null };
};

const clip = (s: string | null, n: number) => (s ? s.slice(0, n) : null);
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function salesTaxCodes(rows: SalesTaxRate[]): ImportedCode[] {
  // lineages of an authority, numbered by their first start date (stable: a new lineage gets the next number)
  const lineages = new Map<string, string[]>();
  for (const r of [...rows].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0))) {
    const list = lineages.get(r.authorityCode) ?? [];
    if (!list.includes(r.appliesTo)) list.push(r.appliesTo);
    lineages.set(r.authorityCode, list);
  }
  return rows.map((r) => {
    const further = /further/i.test(r.appliesTo);
    const n = lineages.get(r.authorityCode)!.filter((a) => /further/i.test(a) === further).indexOf(r.appliesTo);
    return {
      code: `${further ? 'FT' : 'ST'}-${slug(r.authorityCode)}${n > 0 ? `-${n + 1}` : ''}`,
      description: clip(`${r.authorityCode} · ${r.appliesTo}`, 200)!,
      taxType: 'SALES_TAX',
      appliesTo: further ? 'SALES' : 'SALES_AND_PURCHASES',
      salesTaxKind: further ? 'FURTHER' : r.rate === 0 ? 'ZERO_RATED' : 'STANDARD',
      whtSection: null,
      whtNature: null,
      accountRoles: further ? ['FURTHER_TAX_PAYABLE', 'OUTPUT_GST'] : ['OUTPUT_GST'],
      inputAccountRoles: further ? null : ['INPUT_GST'],
      checkAtl: false,
      fbrReference: clip(r.legalReference, 120),
      rate: {
        effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, rate: r.rate, nonAtlRate: null, financeAct: clip(r.legalReference, 80),
        remarks: clip([`Tax Master ${r.masterVersion ?? ''}`.trim(), r.reducedRatesNote && `Reduced: ${r.reducedRatesNote}`].filter(Boolean).join(' · '), 200),
      },
    };
  });
}

export function withholdingCodes(rows: WithholdingRate[]): ImportedCode[] {
  return rows.filter((r) => !r.usesSalarySlabs).map((r) => {
    const advance = r.sectionCode.replace(/\s/g, '').startsWith('236');
    const others = [r.atlRateOther !== null && `others ATL ${r.atlRateOther}%`, r.nonAtlRateOther !== null && `others non-ATL ${r.nonAtlRateOther}%`].filter(Boolean).join(', ');
    return {
      code: `${advance ? 'ADV' : 'WHT'}-${slug(r.sectionCode)}`.slice(0, 20).replace(/-+$/, ''),
      description: clip(`${r.sectionCode} · ${r.nature}`, 200)!,
      taxType: advance ? 'COLLECTION' : 'WITHHOLDING',
      appliesTo: advance ? 'SALES' : 'VENDOR_PAYMENTS',
      salesTaxKind: null,
      whtSection: clip(r.sectionCode, 40),
      whtNature: clip(r.nature, 120),
      accountRoles: advance ? ['ADVANCE_TAX_COLLECTED', 'WHT_PAYABLE'] : r.sectionCode.startsWith('153') ? ['WHT_PAYABLE_153', 'WHT_PAYABLE'] : ['WHT_PAYABLE'],
      inputAccountRoles: null,
      checkAtl: true,
      fbrReference: clip(r.legalReference, 120),
      rate: {
        effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
        rate: r.atlRateCompany ?? r.atlRateOther, nonAtlRate: r.nonAtlRateCompany ?? r.nonAtlRateOther,
        financeAct: clip(r.legalReference, 80),
        remarks: clip([`Tax Master ${r.masterVersion ?? ''}`.trim(), others, r.rateNote].filter(Boolean).join(' · '), 200),
      },
    };
  });
}
