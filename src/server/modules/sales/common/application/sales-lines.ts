import { baseQtyOf, docTotals, lineAmounts, type SalesDocOptions, type SalesLineInput } from '../../../../../shared/index.js';
import { ValidationError } from '../../../../core/domain/errors.js';

/** 400 with field errors keyed like the form (`customerId`, `lines.2.itemId`). */
export const invalid = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Line payload for the Sales save functions and the header totals (same rounding as the database checks):
 * base qty = cartons × units per carton + loose; gross, discount, taxable, tax, total per line.
 */
export function salesLines(o: SalesDocOptions, input: SalesLineInput[], e: Record<string, string>, known?: Set<string>) {
  const rows = input.map((l, i) => {
    const item = l.itemId ? o.products.find((x) => x.id === l.itemId) : null;
    if (l.itemId && !item) e[`lines.${i}.itemId`] = 'Choose an active product';
    if (l.taxCodeId && !o.taxCodes.some((x) => x.id === l.taxCodeId)) e[`lines.${i}.taxCodeId`] = 'Choose a sales tax code';
    const ctn = item && item.ctn > 0 ? item.ctn : 1;
    const qtyCtn = Number(l.qtyCtn ?? 0);
    const qtyLoose = Number(l.qtyLoose ?? 0);
    const baseQty = baseQtyOf(qtyCtn, qtyLoose, ctn);
    const a = lineAmounts({ baseQty, rate: Number(l.rate), discountPct: Number(l.discountPct ?? 0), taxRate: Number(l.taxRate ?? 0) });
    return {
      ...(l.id && (!known || known.has(l.id)) && { id: l.id }), lineNo: i + 1, itemId: l.itemId ?? null, description: l.description || item?.name || '',
      qtyCtn, qtyLoose, ctnFactor: ctn, baseQty, bonusQty: Number(l.bonusQty ?? 0), rate: Number(l.rate), discountPct: Number(l.discountPct ?? 0),
      grossAmount: a.grossAmount, discountAmount: a.discountAmount, taxableAmount: a.netAmount, taxCodeId: l.taxCodeId ?? null, taxRate: Number(l.taxRate ?? 0),
      taxAmount: a.taxAmount, totalAmount: a.totalAmount, hsCode: item?.hsCode ?? null,
      salesOrderLineId: l.salesOrderLineId ?? null, deliveryChallanLineId: l.deliveryChallanLineId ?? null, batchId: l.batchId ?? null, _a: a,
    };
  });
  const t = docTotals(rows.map((r) => r._a));
  return {
    lines: rows.map(({ _a, ...r }) => { void _a; return r; }),
    totals: { grossAmount: t.grossAmount, discountAmount: t.discountAmount, taxableAmount: t.netAmount, taxAmount: t.taxAmount, netAmount: t.totalAmount },
  };
}
