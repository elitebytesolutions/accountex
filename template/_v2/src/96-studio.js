/* =====================================================================
   96-studio.js: Report Studio engine, studio configs & data, and the
   Reports Centre hub (app/reports). Owner: Agent A.
   Every studio route is an empty shell: <div data-studio="key" data-tab="tab">.
   One live instance per studio key is mounted on first enter and then
   moved between that studio's route shells, so state survives tab routing.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers */
  const CO = {
    name: 'Al-Noor Enterprises (Pvt) Ltd',
    addr: '42-B Industrial Estate, Kot Lakhpat, Lahore',
    ntn: 'NTN 4271839-6 · STRN 32-77-8761-234-55',
  };
  const STAMP = '01 Oct 2026 10:24 AM';
  const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const N = (v, dec) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const r10 = (n) => Math.round(n / 10) * 10;
  const sum = (a) => a.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const pct = (a, b, d = 1) => (b ? ((a / b) * 100).toFixed(d) : '0.0') + '%';
  const Rs = (n) => 'Rs ' + N(n, 0);
  const icons = (el) => { if (window.FS && FS.icons) FS.icons(el); else if (window.lucide) lucide.createIcons(); };
  const toast = (m, o) => { if (window.FS && FS.toast) FS.toast(m, o); };
  const later = (ms) => (RM.matches ? Math.min(ms, 120) : ms);

  /* column factory: flags n=numeric v=value col (hideable) d=detail col (desc toggle) x=not summable 2=two decimals */
  const C = (k, l, f = '') => ({ k, l, f });
  /* rows from arrays */
  const mk = (keys, arr) => { const ks = keys.split(','); return arr.map((a) => { const o = {}; ks.forEach((k, i) => { if (a[i] !== undefined) o[k] = a[i]; }); return o; }); };
  /* statement rows: [t, label, ...vals] aligned to cols[1..] */
  const st = (cols, arr) => arr.map((a) => { const o = { t: a[0] }; o[cols[0].k] = a[1]; cols.slice(1).forEach((c, i) => { o[c.k] = a[i + 2] === undefined ? null : a[i + 2]; }); return o; });

  const BR = ['Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad'];

  /* ================================================================
     1. FINANCE (figures reconciled with the v1 statements)
     ================================================================ */
  const tbCols = [C('code', 'Code', 'd'), C('name', 'Account'), C('mdr', 'Movement Dr', 'nv'), C('mcr', 'Movement Cr', 'nv'), C('cdr', 'Closing Debit', 'n'), C('ccr', 'Closing Credit', 'n')];
  const tbRows = mk('g,code,name,mdr,mcr,cdr,ccr', [
    ['Assets', '1100', 'Property, plant & equipment (cost)', 128000, 0, 148650000, 0],
    ['Assets', '1150', 'Accumulated depreciation', 3312000, 0, 0, 52380000],
    ['Assets', '1180', 'Capital work in progress', 1600000, 0, 4800000, 0],
    ['Assets', '1190', 'Long-term deposits', 0, 0, 1250000, 0],
    ['Assets', '1201', 'Stock in trade', 2570000, 0, 26870000, 0],
    ['Assets', '1301', 'Trade debtors', 3720000, 0, 38640000, 0],
    ['Assets', '1350', 'Advances, deposits & prepayments', 460000, 0, 3420000, 0],
    ['Assets', '1420', 'Advance income tax', 730000, 0, 4180000, 0],
    ['Assets', '1430', 'Sales tax refundable', 0, 0, 0, 0],
    ['Assets', '1501', 'Cash in hand', 45000, 0, 325000, 0],
    ['Assets', '1511', 'Meezan Bank — 0123', 1220000, 0, 12640000, 0],
    ['Assets', '1512', 'HBL — 8721', 355000, 0, 5215000, 0],
    ['Assets', '1513', 'UBL — 2294', 0, 130000, 2180000, 0],
    ['Assets', '1514', 'Bank Alfalah — 5510', 140000, 0, 1120000, 0],
    ['Liabilities', '2101', 'Trade creditors', 0, 1560000, 0, 21800000],
    ['Liabilities', '2120', 'Accrued & other liabilities', 0, 550000, 0, 5420000],
    ['Liabilities', '2210', 'Sales tax payable', 0, 802600, 0, 1922600],
    ['Liabilities', '2230', 'Income tax withheld payable', 0, 97400, 0, 1977400],
    ['Liabilities', '2240', 'Provision for taxation', 0, 2592600, 0, 2592600],
    ['Liabilities', '2301', 'Running finance — Meezan Bank', 0, 3500000, 0, 9500000],
    ['Liabilities', '2401', 'Long-term financing — DM', 1000000, 0, 0, 28500000],
    ['Liabilities', '2402', 'Current portion of LT financing', 0, 0, 0, 4000000],
    ['Liabilities', '2410', 'Lease liabilities', 300000, 0, 0, 3600000],
    ['Liabilities', '2450', 'Deferred tax liability', 0, 0, 0, 2850000],
    ['Equity', '3101', 'Share capital', 0, 0, 0, 50000000],
    ['Equity', '3201', 'Retained earnings', 0, 0, 0, 58400000],
    ['Income', '4101', 'Sales — goods', 0, 92450000, 0, 92450000],
    ['Income', '4102', 'Sales — services', 0, 6180000, 0, 6180000],
    ['Income', '4105', 'Sales returns & discounts', 1630000, 0, 1630000, 0],
    ['Income', '4910', 'Other income', 0, 420000, 0, 420000],
    ['Expenses', '5101', 'Cost of goods sold', 65700000, 0, 65700000, 0],
    ['Expenses', '6101', 'Salaries & wages', 9840000, 0, 9840000, 0],
    ['Expenses', '6102', 'Rent, rates & taxes', 2160000, 0, 2160000, 0],
    ['Expenses', '6103', 'Utilities', 1385000, 0, 1385000, 0],
    ['Expenses', '6104', 'Selling & distribution', 3120000, 0, 3120000, 0],
    ['Expenses', '6105', 'Marketing & advertising', 1240000, 0, 1240000, 0],
    ['Expenses', '6106', 'Repairs & maintenance', 640000, 0, 640000, 0],
    ['Expenses', '6107', 'Depreciation expense', 1560000, 0, 1560000, 0],
    ['Expenses', '6108', 'Communication', 285000, 0, 285000, 0],
    ['Expenses', '6109', 'Legal & professional', 450000, 0, 450000, 0],
    ['Expenses', '6110', 'Administrative & general', 780000, 0, 780000, 0],
    ['Expenses', '6111', 'Entertainment', 0, 0, 0, 0],
    ['Expenses', '7101', 'Mark-up on running finance', 1180000, 0, 1180000, 0],
    ['Expenses', '7102', 'Bank charges', 140000, 0, 140000, 0],
    ['Expenses', '8101', 'Taxation — current', 2592600, 0, 2592600, 0],
  ]);

  const plCols = [C('p', 'Particulars'), C('cy', 'Q1 FY 2026-27', 'n'), C('pr', '% Rev', 'nvx'), C('py', 'Q1 FY 2025-26', 'nv'), C('va', 'Variance', 'nv')];
  const plRows = st(plCols, [
    ['s', 'Revenue'],
    ['r', 'Sales — goods', 92450000, '95.3%', 81200000, 11250000],
    ['r', 'Sales — services', 6180000, '6.4%', 5450000, 730000],
    ['r', 'Less: sales returns & discounts', -1630000, '-1.7%', -1350000, -280000],
    ['u', 'Net revenue', 97000000, '100.0%', 85300000, 11700000],
    ['s', 'Cost of sales'],
    ['r', 'Opening stock', 24300000, '25.1%', 21800000, -2500000],
    ['r', 'Purchases', 66850000, '68.9%', 59600000, -7250000],
    ['r', 'Freight & carriage inward', 1420000, '1.5%', 1250000, -170000],
    ['r', 'Less: closing stock', -26870000, '-27.7%', -23950000, 2920000],
    ['u', 'Cost of sales', 65700000, '67.7%', 58700000, -7000000],
    ['t', 'Gross profit', 31300000, '32.3%', 26600000, 4700000],
    ['s', 'Operating expenses'],
    ['r', 'Salaries & wages', 9840000, '10.1%', 8620000, -1220000],
    ['r', 'Rent, rates & taxes', 2160000, '2.2%', 1980000, -180000],
    ['r', 'Utilities', 1385000, '1.4%', 1240000, -145000],
    ['r', 'Selling & distribution', 3120000, '3.2%', 2760000, -360000],
    ['r', 'Marketing & advertising', 1240000, '1.3%', 1410000, 170000],
    ['r', 'Depreciation', 1560000, '1.6%', 1380000, -180000],
    ['r', 'Repairs & maintenance', 640000, '0.7%', 520000, -120000],
    ['r', 'Communication', 285000, '0.3%', 260000, -25000],
    ['r', 'Legal & professional', 450000, '0.5%', 380000, -70000],
    ['r', 'Administrative & general', 780000, '0.8%', 690000, -90000],
    ['r', 'Entertainment', 0, '0.0%', 0, 0],
    ['u', 'Total operating expenses', 21460000, '22.1%', 19240000, -2220000],
    ['r', 'Other income', 420000, '0.4%', 310000, 110000],
    ['t', 'Operating profit', 10260000, '10.6%', 7670000, 2590000],
    ['s', 'Finance cost & taxation'],
    ['r', 'Mark-up on running finance', 1180000, '1.2%', 1410000, 230000],
    ['r', 'Bank charges & commission', 140000, '0.1%', 120000, -20000],
    ['u', 'Total finance cost', 1320000, '1.4%', 1530000, 210000],
    ['u', 'Profit before taxation', 8940000, '9.2%', 6140000, 2800000],
    ['r', 'Taxation — current @ 29%', 2592600, '2.7%', 1780600, -812000],
    ['t', 'Net profit for the period', 6347400, '6.5%', 4359400, 1988000],
  ]);

  const bsCols = [C('p', 'Particulars'), C('note', 'Note', 'dx'), C('cy', '30 Sep 2026', 'n'), C('py', '30 Jun 2026', 'nv'), C('ch', 'Change', 'nv')];
  const bsRows = st(bsCols, [
    ['s', 'Non-current assets'],
    ['r', 'Property, plant & equipment', '4', 96270000, 92830000, 3440000],
    ['r', 'Capital work in progress', '5', 4800000, 3200000, 1600000],
    ['r', 'Long-term deposits', '6', 1250000, 1250000, 0],
    ['u', 'Total non-current assets', '', 102320000, 97280000, 5040000],
    ['s', 'Current assets'],
    ['r', 'Stock in trade', '7', 26870000, 24300000, 2570000],
    ['r', 'Trade debtors', '8', 38640000, 34920000, 3720000],
    ['r', 'Advances, deposits & prepayments', '9', 3420000, 2960000, 460000],
    ['r', 'Advance income tax', '10', 4180000, 3450000, 730000],
    ['r', 'Cash & bank balances', '11', 21480000, 19850000, 1630000],
    ['u', 'Total current assets', '', 94590000, 85480000, 9110000],
    ['t', 'Total assets', '', 196910000, 182760000, 14150000],
    ['s', 'Equity'],
    ['r', 'Share capital — 5,000,000 shares of Rs 10', '12', 50000000, 50000000, 0],
    ['r', 'Retained earnings — brought forward', '', 58400000, 58400000, 0],
    ['r', 'Profit for the period', '', 6347400, 0, 6347400],
    ['u', 'Total equity', '', 114747400, 108400000, 6347400],
    ['s', 'Non-current liabilities'],
    ['r', 'Long-term financing — diminishing musharakah', '13', 28500000, 29500000, -1000000],
    ['r', 'Lease liabilities', '14', 3600000, 3900000, -300000],
    ['r', 'Deferred tax liability', '15', 2850000, 2850000, 0],
    ['u', 'Total non-current liabilities', '', 34950000, 36250000, -1300000],
    ['s', 'Current liabilities'],
    ['r', 'Trade creditors', '16', 21800000, 20240000, 1560000],
    ['r', 'Accrued & other liabilities', '17', 5420000, 4870000, 550000],
    ['r', 'Short-term borrowing — running finance', '18', 9500000, 6000000, 3500000],
    ['r', 'Current portion of long-term financing', '13', 4000000, 4000000, 0],
    ['r', 'Sales tax & withholding tax payable', '19', 3900000, 3000000, 900000],
    ['r', 'Provision for taxation', '20', 2592600, 0, 2592600],
    ['u', 'Total current liabilities', '', 47212600, 38110000, 9102600],
    ['u', 'Total liabilities', '', 82162600, 74360000, 7802600],
    ['t', 'Total equity & liabilities', '', 196910000, 182760000, 14150000],
  ]);

  const cfCols = [C('p', 'Particulars'), C('a', 'Amount', 'nx'), C('s', 'Subtotal', 'nx')];
  const cfRows = st(cfCols, [
    ['s', 'A. Cash flows from operating activities'],
    ['r', 'Profit before taxation', null, 8940000],
    ['h', 'Adjustments for non-cash items:'],
    ['r2', 'Depreciation', 1560000],
    ['r2', 'Gain on disposal of fixed assets', -277000],
    ['r2', 'Finance cost', 1320000, 2603000],
    ['u', 'Operating profit before working capital changes', null, 11543000],
    ['h', '(Increase) / decrease in current assets:'],
    ['r2', 'Stock in trade', -2570000],
    ['r2', 'Trade debtors', -3720000],
    ['r2', 'Advances, deposits & prepayments', -460000],
    ['h', 'Increase / (decrease) in current liabilities:'],
    ['r2', 'Trade creditors', 1560000],
    ['r2', 'Accrued & other liabilities', 550000],
    ['r2', 'Sales tax & withholding tax payable', 900000, -3740000],
    ['u', 'Cash generated from operations', null, 7803000],
    ['r', 'Finance cost paid', -1320000],
    ['r', 'Income tax paid (advance tax)', -730000, -2050000],
    ['t', 'Net cash generated from operating activities', null, 5753000],
    ['s', 'B. Cash flows from investing activities'],
    ['r', 'Purchase of property, plant & equipment', -6818000],
    ['r', 'Additions to capital work in progress', -1600000],
    ['r', 'Proceeds from disposal of fixed assets', 2095000],
    ['t', 'Net cash used in investing activities', null, -6323000],
    ['s', 'C. Cash flows from financing activities'],
    ['r', 'Repayment of long-term financing', -1000000],
    ['r', 'Lease rentals paid (principal)', -300000],
    ['r', 'Running finance — net drawdown', 3500000],
    ['t', 'Net cash generated from financing activities', null, 2200000],
    ['s', 'Net change in cash & cash equivalents'],
    ['u', 'Net increase in cash (A + B + C)', null, 1630000],
    ['r', 'Cash & cash equivalents at 01 Jul 2026', null, 19850000],
    ['t', 'Cash & cash equivalents at 30 Sep 2026', null, 21480000],
  ]);

  const glCols = [C('date', 'Date'), C('vch', 'Voucher'), C('narr', 'Narration'), C('dr', 'Debit', 'n'), C('cr', 'Credit', 'n'), C('bal', 'Balance', 'nx')];
  const glRows = mk('g,date,vch,narr,dr,cr,bal,d', [
    ['1512 · HBL — 8721', '01 Sep 2026', '—', 'Opening balance', null, null, '4,560,000 Dr'],
    ['1512 · HBL — 8721', '02 Sep 2026', 'BRV-2026-000214', 'Receipt — Metro Cash & Carry', 3450000, 0, '8,010,000 Dr', 'Cheque 004512'],
    ['1512 · HBL — 8721', '05 Sep 2026', 'BPV-2026-000198', 'Payment — Nishat Mills', 0, 2800000, '5,210,000 Dr', 'BILL-2026-000171'],
    ['1512 · HBL — 8721', '10 Sep 2026', 'BPV-2026-000203', 'Salary transfer — Karachi & Islamabad', 0, 3120000, '2,090,000 Dr', 'PR-2026-08'],
    ['1512 · HBL — 8721', '14 Sep 2026', 'BRV-2026-000221', 'Receipt — Engro Foods', 4260000, 0, '6,350,000 Dr', 'IBFT'],
    ['1512 · HBL — 8721', '15 Sep 2026', 'BPV-2026-000207', 'FBR sales tax Aug 2026', 0, 1120000, '5,230,000 Dr', 'CPR ST20260915-0021-48812'],
    ['1512 · HBL — 8721', '18 Sep 2026', 'BPV-2026-000211', 'K-Electric — Karachi warehouse', 0, 283200, '4,946,800 Dr', 'September bill'],
    ['1512 · HBL — 8721', '24 Sep 2026', 'BRV-2026-000229', 'Receipt — City Mart Superstores', 2180000, 0, '7,126,800 Dr'],
    ['1512 · HBL — 8721', '28 Sep 2026', 'BPV-2026-000216', 'Payment — Habib Packaging', 0, 1911800, '5,215,000 Dr', 'Net of WHT 153(1)(a)'],
    ['1301 · Trade debtors', '01 Sep 2026', '—', 'Opening balance', null, null, '37,210,000 Dr'],
    ['1301 · Trade debtors', '01–30 Sep', 'INV-2026-000301…486', 'Sales invoices — 186 invoices', 38365000, 0, '75,575,000 Dr', 'Incl. GST & further tax'],
    ['1301 · Trade debtors', '01–30 Sep', 'CN-2026-000018…021', 'Credit notes — returns', 0, 1054000, '74,521,000 Dr', 'Returns & rate differences'],
    ['1301 · Trade debtors', '01–30 Sep', 'BRV — 64 receipts', 'Customer receipts through bank', 0, 33766000, '40,755,000 Dr'],
    ['1301 · Trade debtors', '01–30 Sep', 'CRV — 41 receipts', 'Customer receipts in cash', 0, 1953600, '38,801,400 Dr'],
    ['1301 · Trade debtors', '26 Sep 2026', 'JV-2026-000398', 'Write-off — Karim Traders', 0, 161400, '38,640,000 Dr', 'Board approval 22 Sep'],
    ['6103 · Utilities', '01 Sep 2026', '—', 'Opening balance (YTD)', null, null, '748,000 Dr'],
    ['6103 · Utilities', '08 Sep 2026', 'BILL-2026-000190', 'LESCO — Lahore HQ electricity', 190000, 0, '938,000 Dr', 'August reading'],
    ['6103 · Utilities', '18 Sep 2026', 'BILL-2026-000205', 'K-Electric — Karachi warehouse', 240000, 0, '1,178,000 Dr'],
    ['6103 · Utilities', '22 Sep 2026', 'BILL-2026-000209', 'SNGPL — gas, Faisalabad unit', 25000, 0, '1,203,000 Dr'],
    ['6103 · Utilities', '30 Sep 2026', 'JV-2026-000413', 'Accrual — Sep electricity', 182000, 0, '1,385,000 Dr', 'Islamabad & Faisalabad'],
  ]);

  const dbCols = [C('time', 'Time'), C('vch', 'Voucher'), C('acct', 'Debit account'), C('narr', 'Narration'), C('by', 'By', 'd'), C('dr', 'Debit', 'n'), C('cr', 'Credit', 'n')];
  const dbRows = mk('g,time,vch,acct,d,narr,by,dr,cr', [
    ['Cash', '09:20', 'CRV-2026-000156', '1501 Cash in hand', 'Cr 4101 Sales — goods', 'Counter sale, Lahore HQ', 'Kashif Ali', 84500, 84500],
    ['Cash', '10:05', 'CPV-2026-000231', '6104 Selling & distribution', 'Cr 1501 Cash in hand', 'TCS Logistics — courier', 'Kashif Ali', 12400, 12400],
    ['Bank', '11:30', 'BRV-2026-000236', '1511 Meezan Bank — 0123', 'Cr 1301 Lucky Cement', 'Receipt — INV-2026-000402', 'Hira Ali', 1450000, 1450000],
    ['Bank', '12:15', 'BPV-2026-000219', '2101 Siemens Pakistan', 'Cr 1511 Meezan Bank — 0123', 'BILL-2026-000192 net of WHT', 'Hira Ali', 2640000, 2640000],
    ['Purchases', '14:40', 'BILL-2026-000241', '1201 Stock · 1410 Input tax', 'Cr 2101 Habib Packaging', 'Corrugated cartons — 15,000 pcs', 'Usman Ali', 885000, 885000],
    ['Sales', '16:20', 'CN-2026-000021', '4105 Returns · 2210 Sales tax', 'Cr 1301 Shifa International', 'Damaged goods, INV-2026-000344', 'Bilal Khan', 118000, 118000],
    ['Sales', '17:41', 'INV-2026-000484', '1301 City Mart Superstores', 'Cr 4101 Sales · 2210 Sales tax', '950,000 + GST 171,000', 'Bilal Khan', 1121000, 1121000],
    ['Sales', '17:55', 'INV-2026-000485', '1301 Al-Fatah Stores', 'Cr 4101 Sales · 2210 Sales tax', '600,000 + GST 108,000', 'Bilal Khan', 708000, 708000],
    ['Sales', '18:12', 'INV-2026-000486', '1301 Packages Ltd', 'Cr 4101 Sales · 2210 Sales tax', '1,700,000 + GST 306,000', 'Bilal Khan', 2006000, 2006000],
    ['Journal', '19:10', 'JV-2026-000413', '6103 Utilities', 'Cr 2120 Accrued liabilities', 'Accrual — Sep electricity', 'Hira Ali', 182000, 182000],
    ['Journal', '19:30', 'JV-2026-000414', '6101 Salaries & wages', 'Cr 2130 Salaries payable', 'Payroll PR-2026-09 — gross', 'Ayesha Noor', 3280000, 3280000],
  ]);

  /* Account ledger: Meezan Bank 0123, September, closes at the TB balance 12,640,000 */
  const alCols = [C('date', 'Date'), C('vch', 'Voucher'), C('narr', 'Particulars'), C('dr', 'Debit', 'n'), C('cr', 'Credit', 'n'), C('bal', 'Balance', 'nx')];
  const alRaw = [
    ['01–15 Sep', '03 Sep 2026', 'BRV-2026-000209', 'Receipt — Lucky Cement', 2150000, 0, 'INV-2026-000371'],
    ['01–15 Sep', '06 Sep 2026', 'BPV-2026-000200', 'Payment — Nishat Mills', 0, 1860000, 'BILL-2026-000168'],
    ['01–15 Sep', '09 Sep 2026', 'BRV-2026-000217', 'Receipt — Shifa International', 1180000, 0, 'IBFT'],
    ['01–15 Sep', '12 Sep 2026', 'BPV-2026-000205', 'Rent — Lahore HQ, Sep 2026', 0, 720000, 'Net of WHT u/s 155'],
    ['01–15 Sep', '15 Sep 2026', 'BPV-2026-000208', 'FBR — WHT deposit Aug 2026', 0, 412000, 'CPR IT20260915-0021'],
    ['16–30 Sep', '19 Sep 2026', 'BRV-2026-000225', 'Receipt — Packages Ltd', 1640000, 0, 'Cheque 118204'],
    ['16–30 Sep', '23 Sep 2026', 'BPV-2026-000213', 'Payment — Pak Suzuki Spares', 0, 386000, 'BILL-2026-000183'],
    ['16–30 Sep', '26 Sep 2026', 'BRV-2026-000231', 'Receipt — Interloop Ltd', 960000, 0, 'IBFT'],
    ['16–30 Sep', '30 Sep 2026', 'BRV-2026-000236', 'Receipt — Lucky Cement', 1450000, 0, 'INV-2026-000402'],
    ['16–30 Sep', '30 Sep 2026', 'BPV-2026-000219', 'Payment — Siemens Pakistan', 0, 2640000, 'BILL-2026-000192, net of WHT'],
  ];
  const alRows = (() => {
    const close = 12640000;
    let bal = close - sum(alRaw.map((r) => r[4])) + sum(alRaw.map((r) => r[5]));
    const out = [{ g: '01–15 Sep', date: '01 Sep 2026', vch: '—', narr: 'Opening balance', dr: null, cr: null, bal: N(bal, 0) + ' Dr' }];
    alRaw.forEach((r) => { bal += r[4] - r[5]; out.push({ g: r[0], date: r[1], vch: r[2], narr: r[3], dr: r[4], cr: r[5], bal: N(bal, 0) + ' Dr', d: r[6] }); });
    return out;
  })();
  const alOpen = alRows[0].bal;

  const raCols = [C('ratio', 'Ratio'), C('formula', 'Basis', 'd'), C('cy', 'Q1 FY 2026-27', 'x'), C('py', 'Q1 FY 2025-26', 'xv'), C('bm', 'Benchmark', 'xv')];
  const raRows = mk('g,ratio,formula,cy,py,bm', [
    ['Profitability', 'Gross profit margin', 'Gross profit ÷ net revenue', '32.3%', '31.2%', '30.0%'],
    ['Profitability', 'Operating margin', 'Operating profit ÷ net revenue', '10.6%', '9.0%', '9.5%'],
    ['Profitability', 'Net profit margin', 'Net profit ÷ net revenue', '6.5%', '5.1%', '6.0%'],
    ['Profitability', 'Return on equity (annualised)', 'Net profit × 4 ÷ average equity', '22.8%', '16.9%', '18.0%'],
    ['Liquidity', 'Current ratio', 'Current assets ÷ current liabilities', '2.00 : 1', '2.24 : 1', '1.50 : 1'],
    ['Liquidity', 'Quick ratio', '(Current assets − stock) ÷ current liabilities', '1.43 : 1', '1.61 : 1', '1.00 : 1'],
    ['Liquidity', 'Cash ratio', 'Cash & bank ÷ current liabilities', '0.45 : 1', '0.52 : 1', '0.30 : 1'],
    ['Leverage', 'Debt to equity', 'Borrowings ÷ total equity', '0.37', '0.36', '≤ 0.50'],
    ['Leverage', 'Interest cover', '(PBT + finance cost) ÷ finance cost', '7.8×', '5.0×', '≥ 4.0×'],
    ['Leverage', 'Equity ratio', 'Total equity ÷ total assets', '58.3%', '59.3%', '≥ 50%'],
    ['Efficiency', 'Debtor days (DSO)', 'Trade debtors ÷ revenue × 92', '38 days', '37 days', '≤ 45 days'],
    ['Efficiency', 'Stock days', 'Closing stock ÷ cost of sales × 92', '38 days', '38 days', '≤ 40 days'],
    ['Efficiency', 'Creditor days (DPO)', 'Trade creditors ÷ purchases × 92', '30 days', '31 days', '30–45 days'],
    ['Efficiency', 'Asset turnover (annualised)', 'Net revenue × 4 ÷ total assets', '1.97×', '1.87×', '≥ 1.50×'],
  ]);

  /* ================================================================
     2. INVENTORY (generic SME items, all figures derived from one list)
     ================================================================ */
  const ITEMS = mk('sku,name,cls,brand,wh,qty,cost,rate,uom,reorder,max,d', [
    ['PK-1001', 'Corrugated Carton 5-Ply', 'Packaging', 'Habib Packaging', 'Lahore HQ', 4800, 85, 120, 'Pcs', 1500, 4000, '18 × 12 × 12 in, brown kraft'],
    ['PK-1002', 'Stretch Wrap Film 23µ', 'Packaging', 'Habib Packaging', 'Karachi', 640, 1450, 1850, 'Roll', 150, 400, '500 mm × 300 m cast film'],
    ['PK-1003', 'BOPP Tape 2" Clear', 'Packaging', 'Habib Packaging', 'Lahore HQ', 2350, 95, 140, 'Roll', 600, 2500, '48 mm × 100 yd, 40 micron'],
    ['PK-1004', 'Pallet Wrap 500mm', 'Packaging', 'Habib Packaging', 'Faisalabad', 0, 1650, 2100, 'Roll', 80, 300, 'Pre-stretch, black'],
    ['PK-1005', 'Bubble Wrap Roll 1m', 'Packaging', 'Habib Packaging', 'Islamabad', 0, 2400, 3100, 'Roll', 40, 150, '1 m × 100 m, 10 mm bubble'],
    ['OF-2001', 'HP LaserJet Toner 85A', 'Office Supplies', 'HP', 'Islamabad', 46, 9800, 12500, 'Pcs', 12, 30, 'CE285A original cartridge'],
    ['OF-2002', 'A4 Paper Ream 80gsm', 'Office Supplies', 'Double A', 'Lahore HQ', 1240, 1350, 1650, 'Ream', 300, 1000, '500 sheets, 80 gsm'],
    ['OF-2003', 'Box File Lever Arch', 'Office Supplies', 'Deli', 'Islamabad', 420, 380, 520, 'Pcs', 100, 600, 'Foolscap, 75 mm spine'],
    ['SF-3001', 'Industrial Gloves (Nitrile)', 'Safety', 'Ansell', 'Karachi', 3600, 210, 290, 'Pair', 800, 3000, 'Chemical resistant, size L'],
    ['SF-3002', 'Safety Helmet ANSI', 'Safety', '3M', 'Islamabad', -12, 1850, 2400, 'Pcs', 40, 200, 'Class E, ratchet suspension'],
    ['FD-4001', 'Shan Masala Pack 50g', 'FMCG', 'Shan Foods', 'Karachi', 9600, 115, 150, 'Pack', 2000, 8000, 'Biryani masala, 50 g'],
    ['FD-4002', 'Dettol Liquid 500ml', 'FMCG', 'Reckitt', 'Lahore HQ', 1320, 640, 820, 'Btl', 300, 1500, 'Antiseptic disinfectant'],
    ['FD-4003', 'Nestlé Pure Life 1.5L ×6', 'FMCG', 'Nestlé', 'Faisalabad', 750, 520, 690, 'Pack', 200, 600, 'Mineral water, 6 × 1.5 L'],
    ['EL-5001', 'LED Panel 2x2 48W', 'Electrical', 'Philips', 'Lahore HQ', 180, 4950, 6400, 'Pcs', 60, 150, 'Cool daylight 6500 K'],
    ['EL-5002', 'Copper Cable 7/29', 'Electrical', 'Pakistan Cables', 'Faisalabad', 64, 18500, 22800, 'Coil', 20, 80, '90 m coil, PVC insulated'],
    ['EL-5003', 'Ceiling Fan 56"', 'Electrical', 'Pak Fan', 'Karachi', -8, 8900, 11200, 'Pcs', 25, 120, 'Copper winding, 56 in sweep'],
  ]);
  ITEMS.forEach((it, i) => {
    it.val = it.qty * it.cost;
    const q = Math.max(it.qty, 0);
    it.inn = it.qty > 0 ? r10(q * 0.38) + (i % 3) * 20 : (it.qty < 0 ? 0 : 0);
    it.out = it.qty > 0 ? r10(q * 0.25) + (i % 2) * 30 : (it.qty < 0 ? 20 - it.qty : 60 + i * 5);
    it.open = it.qty - it.inn + it.out;
    it.over = it.qty > it.max;
  });
  const invPos = ITEMS.filter((i) => i.qty !== 0);
  const invQty = sum(invPos.map((i) => i.qty));
  const invVal = sum(invPos.map((i) => i.val));
  const invCols = [C('sku', 'SKU'), C('name', 'Product Name'), C('cls', 'Class'), C('brand', 'Company'), C('wh', 'Warehouse'), C('qty', 'Qty', 'nx'), C('cost', 'Unit Cost', 'nxv'), C('val', 'Total Value', 'nv')];
  const invStats = (rows, qtyKey, valKey, l3) => [
    ['package', 'Total Products', N(rows.length, 0)],
    ['boxes', 'Total Stock Quantity', N(sum(rows.map((r) => r[qtyKey])), 0)],
    ['coins', l3 || 'Total Stock Value', Rs(sum(rows.map((r) => r[valKey])))],
  ];
  const asOnRows = ITEMS.map((i) => ({ sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, open: i.open, inn: i.inn, out: i.out, qty: i.qty, val: i.val }));
  const overRows = ITEMS.filter((i) => i.over).map((i) => ({ sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, over: true, qty: i.qty, max: i.max, ex: i.qty - i.max, exv: (i.qty - i.max) * i.cost, cover: Math.round(i.qty / Math.max(1, i.out / 92)) + ' days' }));
  const listRows = ITEMS.map((i) => ({ sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, uom: i.uom, reorder: i.reorder, rate: i.rate, cost: i.cost, z: i.qty === 0 }));
  const minusRows = mk('sku,name,cls,brand,wh,qty,grn,cost,doc', [
    ['SF-3002', 'Safety Helmet ANSI', 'Safety', '3M', 'Islamabad', -12, 40, 1850, 'DN-2026-000318'],
    ['EL-5003', 'Ceiling Fan 56"', 'Electrical', 'Pak Fan', 'Karachi', -8, 30, 8900, 'DN-2026-000322'],
    ['PK-1003', 'BOPP Tape 2" Clear', 'Packaging', 'Habib Packaging', 'Karachi', -36, 600, 95, 'DN-2026-000309'],
    ['FD-4002', 'Dettol Liquid 500ml', 'FMCG', 'Reckitt', 'Islamabad', -24, 0, 640, 'INV-2026-000478'],
    ['OF-2002', 'A4 Paper Ream 80gsm', 'Office Supplies', 'Double A', 'Faisalabad', -15, 200, 1350, 'DN-2026-000315'],
    ['SF-3001', 'Industrial Gloves (Nitrile)', 'Safety', 'Ansell', 'Lahore HQ', -40, 0, 210, 'DN-2026-000321'],
    ['PK-1004', 'Pallet Wrap 500mm', 'Packaging', 'Habib Packaging', 'Faisalabad', 0, 50, 1650, 'DN-2026-000301'],
  ]).map((r) => Object.assign(r, { sv: r.qty * r.cost }));
  const VAR = [0, -2, 0, 0, 0, 1, -5, 0, -20, 0, 40, -6, 0, 0, 1, 0];
  const checkRows = ITEMS.map((i, k) => {
    const v = VAR[k];
    return { sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, book: i.qty, phys: i.qty + v, var: v, vv: v * i.cost, stat: v === 0 ? 'Matched' : v < 0 ? 'Short' : 'Excess', z: i.qty === 0 && v === 0 };
  });
  const valRows = ITEMS.map((i) => ({ sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, qty: i.qty, cost: i.cost, val: i.val, sh: pct(i.val, invVal) }));
  const LASTMV = ['30 Sep', '29 Sep', '30 Sep', '12 Sep', '04 Sep', '27 Sep', '30 Sep', '22 Sep', '28 Sep', '30 Sep', '30 Sep', '30 Sep', '26 Sep', '25 Sep', '19 Sep', '30 Sep'];
  const mvRows = ITEMS.map((i, k) => ({ sku: i.sku, name: i.name, cls: i.cls, brand: i.brand, wh: i.wh, d: i.d, open: i.open, inn: i.inn, out: i.out, qty: i.qty, turn: i.open + i.qty > 0 ? ((i.out * 4) / ((i.open + Math.max(i.qty, 0)) / 2 || 1)).toFixed(1) + '×' : '—', last: LASTMV[k] + ' 2026' }));

  /* ================================================================
     3. RECEIVABLES
     ================================================================ */
  const arCols = [C('cust', 'Customer'), C('terms', 'Terms', 'd'), C('b0', 'Current', 'nv'), C('b1', '1–30', 'nv'), C('b2', '31–60', 'nv'), C('b3', '61–90', 'nv'), C('b4', '90+', 'nv'), C('tot', 'Total (Rs)', 'n')];
  const arRows = mk('cust,city,terms,b0,b1,b2,b3,b4,d', [
    ['Lucky Cement', 'Karachi', 'Net 30', 2478000, 0, 0, 0, 0],
    ['City Mart Superstores', 'Lahore HQ', 'Net 30', 1180000, 189100, 0, 0, 0],
    ['Engro Foods', 'Karachi', 'Net 30', 1183000, 0, 0, 0, 0],
    ['Shifa International', 'Islamabad', 'Net 30', 1003000, 0, 0, 0, 0],
    ['Interloop Ltd', 'Faisalabad', 'Net 30', 0, 896800, 0, 0, 0],
    ['Al-Fatah Stores', 'Lahore HQ', 'Net 30', 0, 0, 375240, 214600, 128450, 'Follow-up call booked 03 Oct'],
    ['Packages Ltd', 'Lahore HQ', 'Net 30', 663200, 0, 0, 0, 0],
    ['Hashoo Hotels', 'Islamabad', 'Net 30', 348100, 219480, 0, 0, 0],
    ['Metro Cash & Carry', 'Lahore HQ', 'Net 45', 0, 0, 0, 0, 46500, 'Disputed — short delivery claim'],
    ['Fatima Group', 'Lahore HQ', 'Net 30', 0, 0, 0, 0, 0],
  ]).map((r) => Object.assign(r, { tot: r.b0 + r.b1 + r.b2 + r.b3 + r.b4 }));
  const CUSTCITY = { 'Lucky Cement': 'Karachi', 'City Mart Superstores': 'Lahore HQ', 'Engro Foods': 'Karachi', 'Shifa International': 'Islamabad', 'Interloop Ltd': 'Faisalabad', 'Al-Fatah Stores': 'Lahore HQ', 'Packages Ltd': 'Lahore HQ', 'Hashoo Hotels': 'Islamabad', 'Metro Cash & Carry': 'Lahore HQ', 'Fatima Group': 'Lahore HQ' };
  const srCols = [C('date', 'Date'), C('inv', 'Invoice'), C('cust', 'Customer'), C('net', 'Net', 'nv'), C('gst', 'GST 18%', 'nv'), C('tot', 'Total', 'n')];
  const srRows = mk('date,inv,cust,net,d', [
    ['02 Sep 2026', 'INV-2026-000475', 'Lucky Cement', 2100000, 'Cement bags & pallets'],
    ['04 Sep 2026', 'INV-2026-000476', 'Engro Foods', 1850000],
    ['06 Sep 2026', 'INV-2026-000477', 'Metro Cash & Carry', 2450000],
    ['09 Sep 2026', 'INV-2026-000478', 'Shifa International', 850000],
    ['11 Sep 2026', 'INV-2026-000479', 'Interloop Ltd', 760000],
    ['14 Sep 2026', 'INV-2026-000480', 'Hashoo Hotels', 295000],
    ['17 Sep 2026', 'INV-2026-000481', 'Packages Ltd', 1320000],
    ['20 Sep 2026', 'INV-2026-000482', 'City Mart Superstores', 1000000],
    ['24 Sep 2026', 'INV-2026-000483', 'Fatima Group', 540000],
    ['30 Sep 2026', 'INV-2026-000484', 'City Mart Superstores', 950000],
    ['30 Sep 2026', 'INV-2026-000485', 'Al-Fatah Stores', 600000],
    ['30 Sep 2026', 'INV-2026-000486', 'Packages Ltd', 1700000],
    ['30 Sep 2026', 'CN-2026-000021', 'Shifa International', -100000, 'Return of damaged goods'],
  ]).map((r) => Object.assign(r, { city: CUSTCITY[r.cust], gst: Math.round(r.net * 0.18), tot: Math.round(r.net * 1.18) }));
  const csCols = [C('date', 'Date'), C('doc', 'Document'), C('part', 'Particulars'), C('dr', 'Debit', 'n'), C('cr', 'Credit', 'n'), C('bal', 'Balance', 'nx')];
  const csStatement = (open, raw) => {
    let bal = open;
    const out = [{ g: 'Brought forward', date: '01 Sep 2026', doc: '—', part: 'Opening balance', dr: null, cr: null, bal: N(open, 0) + ' Dr' }];
    raw.forEach((r) => { bal += (r[3] || 0) - (r[4] || 0); out.push({ g: 'September 2026', date: r[0], doc: r[1], part: r[2], dr: r[3], cr: r[4], bal: N(bal, 0) + (bal >= 0 ? ' Dr' : ' Cr'), d: r[5] }); });
    return out;
  };
  const csRows = csStatement(2650000, [
    ['02 Sep 2026', 'INV-2026-000475', 'Sales invoice — cement bags & pallets', 2478000, 0, 'Net 2,100,000 + GST 378,000'],
    ['15 Sep 2026', 'BRV-2026-000222', 'Receipt — against INV-2026-000398', 0, 1200000, 'Meezan Bank — 0123'],
    ['30 Sep 2026', 'BRV-2026-000236', 'Receipt — against INV-2026-000402', 0, 1450000, 'Meezan Bank — 0123'],
  ]);
  const sbcCols = [C('cust', 'Customer'), C('n', 'Invoices', 'nx'), C('net', 'Net Sales', 'n'), C('gst', 'GST', 'nv'), C('gross', 'Gross', 'nv'), C('sh', 'Share', 'x')];
  const sbcRaw = [['Lucky Cement', 41, 16420000], ['Metro Cash & Carry', 37, 14850000], ['Engro Foods', 29, 12960000], ['City Mart Superstores', 44, 11240000], ['Packages Ltd', 22, 9870000], ['Shifa International', 18, 8350000], ['Interloop Ltd', 15, 7620000], ['Al-Fatah Stores', 31, 6180000], ['Hashoo Hotels', 12, 4960000], ['Fatima Group', 8, 3240000], ['Walk-in & counter sales', 214, 2940000]];
  const sbcTotal = sum(sbcRaw.map((r) => r[2]));
  const sbcRows = sbcRaw.map((r) => ({ cust: r[0], city: CUSTCITY[r[0]] || 'Lahore HQ', n: r[1], net: r[2], gst: Math.round(r[2] * 0.18), gross: Math.round(r[2] * 1.18), sh: pct(r[2], sbcTotal) }));
  const sbiCols = [C('sku', 'SKU', 'd'), C('name', 'Item'), C('qty', 'Qty Sold', 'nx'), C('rate', 'Avg Rate', 'nxv'), C('net', 'Net Sales', 'n'), C('gp', 'Gross Margin', 'xv')];
  const sbiRows = ITEMS.filter((i) => i.qty !== 0).map((i, k) => {
    const q = Math.round((Math.abs(i.out) * 4.2 + 150) / 10) * 10;
    return { sku: i.sku, name: i.name, cls: i.cls, d: i.brand, qty: q, rate: i.rate, net: q * i.rate, gp: pct(i.rate - i.cost, i.rate) };
  });
  const gstCols = [C('inv', 'Invoice'), C('cust', 'Customer'), C('strn', 'STRN', 'd'), C('net', 'Value excl. tax', 'n'), C('rate', 'Rate', 'x'), C('gst', 'Sales Tax', 'n'), C('ft', 'Further Tax', 'nv')];
  const STRN = { 'Lucky Cement': '32-77-8761-001-23', 'Engro Foods': '32-77-8761-118-40', 'Metro Cash & Carry': '32-77-8761-204-11', 'Shifa International': '07-01-9876-543-21', 'Interloop Ltd': '32-77-8761-310-77', 'Hashoo Hotels': '07-01-9876-221-09', 'Packages Ltd': '32-77-8761-045-62', 'City Mart Superstores': '32-77-8761-512-38', 'Fatima Group': '32-77-8761-090-14', 'Al-Fatah Stores': '32-77-8761-377-05' };
  const gstRows = srRows.map((r) => ({ inv: r.inv, cust: r.cust, city: r.city, strn: STRN[r.cust], net: r.net, rate: '18%', gst: r.gst, ft: 0 }))
    .concat([
      { inv: 'INV-2026-000487', cust: 'Counter sales — unregistered', city: 'Lahore HQ', strn: 'Unregistered', net: 410000, rate: '18%', gst: 73800, ft: 16400 },
      { inv: 'INV-2026-000488', cust: 'Counter sales — unregistered', city: 'Karachi', strn: 'Unregistered', net: 265000, rate: '18%', gst: 47700, ft: 10600 },
    ]);

  /* ================================================================
     4. PAYABLES
     ================================================================ */
  const apCols = [C('vend', 'Vendor'), C('terms', 'Terms', 'd'), C('b0', 'Current', 'nv'), C('b1', '1–30', 'nv'), C('b2', '31–60', 'nv'), C('b3', '61–90', 'nv'), C('b4', '90+', 'nv'), C('tot', 'Total (Rs)', 'n')];
  const apRows = mk('vend,city,terms,b0,b1,b2,b3,b4,d', [
    ['Siemens Pakistan', 'Karachi', 'Net 30', 1638500, 1299000, 0, 0, 0],
    ['Habib Packaging', 'Lahore HQ', 'Net 30', 700600, 0, 0, 0, 0],
    ['Nishat Mills', 'Lahore HQ', 'Net 30', 607400, 0, 0, 0, 0],
    ['LESCO', 'Lahore HQ', 'Net 14', 368160, 0, 0, 0, 0],
    ['Pak Suzuki Spares', 'Lahore HQ', 'Net 30', 276850, 0, 0, 0, 34500, 'Disputed — wrong part supplied'],
    ['TCS Logistics', 'Karachi', 'Net 15', 0, 147400, 62300, 0, 0],
    ['K-Electric', 'Karachi', 'Net 14', 186440, 0, 0, 0, 0],
    ['Shan Foods', 'Karachi', 'Net 20', 0, 97180, 0, 0, 0],
    ['Daraz Business', 'Karachi', 'Net 15', 0, 0, 0, 18900, 0],
    ['PTCL', 'Islamabad', 'Net 15', 0, 0, 0, 0, 0],
  ]).map((r) => Object.assign(r, { tot: r.b0 + r.b1 + r.b2 + r.b3 + r.b4 }));
  const VENDCITY = { 'Siemens Pakistan': 'Karachi', 'Habib Packaging': 'Lahore HQ', 'Nishat Mills': 'Lahore HQ', LESCO: 'Lahore HQ', 'Pak Suzuki Spares': 'Lahore HQ', 'TCS Logistics': 'Karachi', 'K-Electric': 'Karachi', 'Shan Foods': 'Karachi', 'Daraz Business': 'Karachi', PTCL: 'Islamabad' };
  const prCols = [C('date', 'Date'), C('bill', 'Bill'), C('vend', 'Vendor'), C('net', 'Net', 'nv'), C('gst', 'Input Tax', 'nv'), C('tot', 'Total', 'n')];
  const prRows = mk('date,bill,vend,net,gr,d', [
    ['03 Sep 2026', 'BILL-2026-000185', 'Nishat Mills', 514750, 18, 'Cotton fabric rolls'],
    ['05 Sep 2026', 'BILL-2026-000187', 'Siemens Pakistan', 1388559, 18, 'Switchgear & control panels'],
    ['08 Sep 2026', 'BILL-2026-000190', 'LESCO', 161017, 18, 'Lahore HQ electricity, Aug'],
    ['10 Sep 2026', 'BILL-2026-000194', 'Pak Suzuki Spares', 234619, 18],
    ['12 Sep 2026', 'BILL-2026-000196', 'Shan Foods', 82356, 18],
    ['15 Sep 2026', 'BILL-2026-000199', 'TCS Logistics', 147400, 0, 'Courier & freight — services'],
    ['18 Sep 2026', 'BILL-2026-000205', 'K-Electric', 203390, 18, 'Karachi warehouse electricity'],
    ['21 Sep 2026', 'BILL-2026-000210', 'Daraz Business', 16017, 18],
    ['24 Sep 2026', 'BILL-2026-000214', 'PTCL', 52000, 0, 'Internet & landlines — services'],
    ['27 Sep 2026', 'BILL-2026-000238', 'Habib Packaging', 593729, 18],
    ['30 Sep 2026', 'BILL-2026-000241', 'Habib Packaging', 750000, 18, 'Corrugated cartons — 15,000 pcs'],
  ]).map((r) => Object.assign(r, { city: VENDCITY[r.vend], gst: Math.round((r.net * r.gr) / 100), tot: r.net + Math.round((r.net * r.gr) / 100) }));
  const vsRows = ((() => {
    let bal = 3939000;
    const out = [{ g: 'Brought forward', date: '01 Sep 2026', doc: '—', part: 'Opening balance', dr: null, cr: null, bal: N(bal, 0) + ' Cr' }];
    [['05 Sep 2026', 'BILL-2026-000187', 'Bill — switchgear & control panels', 0, 1638500, 'Due 05 Oct 2026'],
      ['30 Sep 2026', 'BPV-2026-000219', 'Payment — Meezan Bank 0123', 2640000, 0, 'Against BILL-2026-000192, net of WHT 5.5%']].forEach((r) => {
      bal += r[4] - r[3];
      out.push({ g: 'September 2026', date: r[0], doc: r[1], part: r[2], dr: r[3], cr: r[4], bal: N(bal, 0) + ' Cr', d: r[5] });
    });
    return out;
  })());
  const whtCols = [C('doc', 'Payment'), C('vend', 'Vendor'), C('sec', 'Section', 'd'), C('gross', 'Gross Amount', 'nv'), C('rate', 'Rate', 'x'), C('wht', 'Tax Withheld', 'n'), C('net', 'Net Paid', 'nv')];
  const whtRows = mk('g,doc,vend,sec,gross,rate,wht', [
    ['153(1)(a) Goods', 'BPV-2026-000198', 'Nishat Mills', '153(1)(a)', 2962963, '5.5%', 162963],
    ['153(1)(a) Goods', 'BPV-2026-000213', 'Pak Suzuki Spares', '153(1)(a)', 408466, '5.5%', 22466],
    ['153(1)(a) Goods', 'BPV-2026-000216', 'Habib Packaging', '153(1)(a)', 2023069, '5.5%', 111269],
    ['153(1)(a) Goods', 'BPV-2026-000219', 'Siemens Pakistan', '153(1)(a)', 2793651, '5.5%', 153651],
    ['153(1)(b) Services', 'BPV-2026-000209', 'TCS Logistics', '153(1)(b)', 180000, '11%', 19800],
    ['153(1)(b) Services', 'BPV-2026-000214', 'Daraz Business', '153(1)(b)', 95000, '11%', 10450],
    ['155 Rent', 'BPV-2026-000205', 'Kot Lakhpat Estates (landlord)', '155', 847059, '15%', 127059],
    ['236 Telephone', 'BPV-2026-000215', 'PTCL', '236', 52000, '15%', 7800],
  ]).map((r) => Object.assign(r, { net: r.gross - r.wht }));
  const pbvCols = [C('vend', 'Vendor'), C('n', 'Bills', 'nx'), C('net', 'Net Purchases', 'n'), C('gst', 'Input Tax', 'nv'), C('gross', 'Gross', 'nv'), C('sh', 'Share', 'x')];
  const pbvRaw = [['Materials', 'Nishat Mills', 14, 18420000, 18], ['Materials', 'Habib Packaging', 21, 12960000, 18], ['Materials', 'Shan Foods', 9, 6180000, 18], ['Equipment', 'Siemens Pakistan', 6, 14250000, 18], ['Equipment', 'Pak Suzuki Spares', 11, 4320000, 18], ['Services', 'TCS Logistics', 27, 2140000, 0], ['Services', 'Daraz Business', 18, 1260000, 18], ['Utilities', 'LESCO', 3, 1480000, 18], ['Utilities', 'K-Electric', 3, 1120000, 18], ['Utilities', 'PTCL', 3, 286000, 0]];
  const pbvTotal = sum(pbvRaw.map((r) => r[3]));
  const pbvRows = pbvRaw.map((r) => ({ g: r[0], vend: r[1], city: VENDCITY[r[1]], n: r[2], net: r[3], gst: Math.round((r[3] * r[4]) / 100), gross: r[3] + Math.round((r[3] * r[4]) / 100), sh: pct(r[3], pbvTotal) }));

  /* ================================================================
     5. PAYROLL (September 2026, PR-2026-09)
     ================================================================ */
  const EMP = mk('id,name,desg,dept,branch,basic,allow,pg,cnic', [
    ['EMP-0001', 'Ahmed Raza', 'Chief Executive Officer', 'Administration', 'Lahore HQ', 520000, 260000, 'Management', '35202-1188392-1'],
    ['EMP-0007', 'Sana Javed', 'Finance Manager', 'Finance', 'Lahore HQ', 210000, 105000, 'Management', '35201-6630184-2'],
    ['EMP-0012', 'Hira Ali', 'Accountant', 'Finance', 'Lahore HQ', 92000, 46000, 'Staff', '35201-2277840-4'],
    ['EMP-0015', 'Ayesha Noor', 'HR Manager', 'Human Resources', 'Lahore HQ', 180000, 90000, 'Management', '35202-9921347-6'],
    ['EMP-0042', 'Bilal Khan', 'Sales Executive', 'Sales', 'Lahore HQ', 78000, 39000, 'Staff', '35202-4418827-3'],
    ['EMP-0051', 'Usman Ali', 'Procurement Officer', 'Procurement', 'Karachi', 86000, 43000, 'Staff', '42201-5530912-7'],
    ['EMP-0063', 'Umar Farooq', 'Operations Supervisor', 'Operations', 'Faisalabad', 74000, 37000, 'Staff', '33100-2219087-5'],
    ['EMP-0071', 'Zainab Raza', 'Key Account Manager', 'Sales', 'Islamabad', 124000, 62000, 'Management', '61101-7720394-8'],
    ['EMP-0088', 'Hamza Butt', 'Warehouse In-charge', 'Warehouse', 'Lahore HQ', 68000, 34000, 'Staff', '35202-6610428-9'],
    ['EMP-0094', 'Fatima Noor', 'Software Engineer', 'IT', 'Lahore HQ', 150000, 75000, 'Staff', '35201-8843210-0'],
    ['EMP-0102', 'Kashif Ali', 'Cashier', 'Finance', 'Lahore HQ', 56000, 28000, 'Staff', '33100-7726541-9'],
    ['EMP-0117', 'Nida Shah', 'HR Officer', 'Human Resources', 'Islamabad', 72000, 36000, 'Staff', '61101-3398812-4'],
    ['EMP-0123', 'Faisal Qureshi', 'IT Manager', 'IT', 'Karachi', 230000, 115000, 'Management', '42101-4402871-3'],
    ['EMP-0136', 'Mehwish Tariq', 'Sales Coordinator', 'Sales', 'Karachi', 64000, 32000, 'Staff', '42201-9917305-6'],
  ]);
  const annualTax = (y) => (y <= 600000 ? 0 : y <= 1200000 ? (y - 600000) * 0.01 : y <= 2200000 ? 6000 + (y - 1200000) * 0.11 : y <= 3200000 ? 116000 + (y - 2200000) * 0.23 : y <= 4100000 ? 346000 + (y - 3200000) * 0.3 : 616000 + (y - 4100000) * 0.35);
  EMP.forEach((e, i) => {
    e.gross = e.basic + e.allow;
    e.tax = Math.round(annualTax(e.gross * 12) / 12);
    e.eobi = 370;
    e.pf = Math.round(e.basic * 0.08);
    e.net = e.gross - e.tax - e.eobi - e.pf;
    e.bank = e.name === 'Kashif Ali' ? 'Cheque' : e.branch === 'Karachi' || e.branch === 'Islamabad' ? 'HBL — 8721 (IBFT)' : 'Meezan Bank — 0123';
    e.acct = e.bank === 'Cheque' ? 'Chq 004871' : (e.bank.startsWith('HBL') ? 'PK36 HABB 0012 ' : 'PK72 MEZN 0001 ') + String(4471023 + i * 7919).slice(-7);
    e.eobiNo = ({ 'Lahore HQ': 'LHR', Karachi: 'KHI', Islamabad: 'ISB', Faisalabad: 'FSD' })[e.branch] + '-' + (1000 + i * 87) + '-' + (10021 + i * 3391);
    e.pfOpen = Math.round((e.basic * 0.16 * (6 + ((i * 7) % 30))) / 1000) * 1000;
    e.pfProfit = Math.round(e.pfOpen * 0.0125);
  });
  const P = (e, extra) => Object.assign({ name: e.name, d: e.id + ' · ' + e.desg, dept: e.dept, branch: e.branch, pg: e.pg }, extra);
  const regCols = [C('name', 'Employee'), C('basic', 'Basic', 'nv'), C('allow', 'Allowances', 'nv'), C('gross', 'Gross', 'n'), C('tax', 'Tax', 'n'), C('eobi', 'EOBI', 'n'), C('pf', 'PF', 'n'), C('net', 'Net Pay', 'n')];
  const regRows = EMP.map((e) => P(e, { basic: e.basic, allow: e.allow, gross: e.gross, tax: e.tax, eobi: e.eobi, pf: e.pf, net: e.net }));
  const advCols = [C('name', 'Employee'), C('bank', 'Bank / Mode'), C('acct', 'Account / IBAN', 'd'), C('net', 'Amount', 'n')];
  const advRows = EMP.map((e) => P(e, { bank: e.bank, acct: e.acct, net: e.net }));
  const eobiCols = [C('no', 'EOBI No.'), C('name', 'Employee'), C('cnic', 'CNIC', 'd'), C('days', 'Days', 'nx'), C('wage', 'Wages', 'nv'), C('ee', 'Employee 1%', 'n'), C('er', 'Employer 5%', 'n'), C('tot', 'Total', 'n')];
  const eobiRows = EMP.map((e) => P(e, { no: e.eobiNo, cnic: e.cnic, days: 30, wage: 37000, ee: 370, er: 1850, tot: 2220 }));
  const pessiCols = [C('name', 'Employee'), C('reg', 'PESSI No.', 'd'), C('wage', 'Contributory Wages', 'nv'), C('er', 'Employer 6%', 'n')];
  const pessiRows = EMP.filter((e) => e.branch !== 'Karachi').map((e, i) => P(e, { reg: 'PSS-' + (240115 + i * 413), wage: 37000, er: 2220 }));
  const s149Cols = [C('name', 'Employee'), C('cnic', 'CNIC / NTN', 'd'), C('gross', 'Taxable Salary', 'n'), C('ann', 'Annual Projection', 'nv'), C('tax', 'Tax · Sep', 'n'), C('ytd', 'Tax YTD', 'nv')];
  const s149Rows = EMP.map((e) => P(e, { cnic: e.cnic, gross: e.gross, ann: e.gross * 12, tax: e.tax, ytd: e.tax * 3 }));
  const pfCols = [C('name', 'Employee'), C('open', 'Opening', 'nv'), C('ee', 'Employee 8%', 'n'), C('er', 'Employer 8%', 'n'), C('prof', 'Profit', 'nv'), C('close', 'Closing', 'n')];
  const pfRows = EMP.map((e) => P(e, { open: e.pfOpen, ee: e.pf, er: e.pf, prof: e.pfProfit, close: e.pfOpen + 2 * e.pf + e.pfProfit }));
  const regTot = { gross: sum(EMP.map((e) => e.gross)), tax: sum(EMP.map((e) => e.tax)), net: sum(EMP.map((e) => e.net)), pf: sum(EMP.map((e) => e.pf)) };

  /* ================================================================
     6. HR
     ================================================================ */
  const DEPTS = [
    ['Commercial', 'Sales', 18, 12, 7, 5, 11, 98000],
    ['Operations', 'Operations', 14, 10, 6, 8, 5, 88000],
    ['Operations', 'Warehouse', 12, 10, 4, 8, 1, 62000],
    ['Support', 'Administration', 10, 5, 3, 3, 6, 128000],
    ['Support', 'IT', 9, 4, 3, 0, 5, 185000],
    ['Support', 'Finance', 8, 3, 2, 1, 6, 165000],
    ['Commercial', 'Procurement', 5, 4, 2, 1, 3, 118000],
    ['Support', 'Human Resources', 5, 2, 1, 1, 8, 145000],
  ];
  const hcCols = [C('dept', 'Department'), C('lhr', 'Lahore HQ', 'n'), C('khi', 'Karachi', 'n'), C('isb', 'Islamabad', 'n'), C('fsd', 'Faisalabad', 'n'), C('tot', 'Total', 'n'), C('fem', 'Female', 'nv'), C('fp', 'Female %', 'xv')];
  const hcRows = DEPTS.map((d) => ({ g: d[0], dept: d[1], lhr: d[2], khi: d[3], isb: d[4], fsd: d[5], tot: d[2] + d[3] + d[4] + d[5], fem: d[6], fp: pct(d[6], d[2] + d[3] + d[4] + d[5], 0) }));
  const ATT = [[25, 0, 1, 0, 0], [24, 0, 2, 1, 6], [25, 1, 0, 3, 4], [26, 0, 0, 0, 2], [23, 1, 2, 5, 12], [24, 0, 2, 2, 8], [22, 2, 2, 6, 18], [25, 0, 1, 1, 5], [21, 3, 2, 8, 22], [25, 0, 1, 2, 3], [24, 1, 1, 4, 10], [26, 0, 0, 0, 0], [24, 0, 2, 1, 4], [23, 1, 2, 3, 6]];
  const attCols = [C('name', 'Employee'), C('present', 'Present', 'n'), C('absent', 'Absent', 'n'), C('leave', 'Leave', 'n'), C('late', 'Late', 'n'), C('ot', 'OT hrs', 'nv'), C('rate', 'Attendance', 'x')];
  const attRows = EMP.map((e, i) => P(e, { present: ATT[i][0], absent: ATT[i][1], leave: ATT[i][2], late: ATT[i][3], ot: ATT[i][4], rate: pct(ATT[i][0], 26) }));
  const LV = [[14, 6, 8, 6], [11, 4, 7, 9], [16, 8, 10, 4], [9, 5, 8, 11], [12, 3, 6, 8], [18, 9, 10, 2], [7, 2, 5, 13], [15, 6, 9, 5], [4, 1, 3, 16], [13, 7, 10, 7], [10, 5, 7, 10], [17, 8, 10, 3], [12, 6, 9, 8], [8, 4, 6, 12]];
  const lvCols = [C('name', 'Employee'), C('an', 'Annual', 'n'), C('ca', 'Casual', 'n'), C('si', 'Sick', 'n'), C('av', 'Availed YTD', 'n'), C('enc', 'Encashment Value', 'nv')];
  const lvRows = EMP.map((e, i) => P(e, { an: LV[i][0], ca: LV[i][1], si: LV[i][2], av: LV[i][3], enc: Math.round((e.basic / 30) * LV[i][0]) }));
  const LATE = [['30 Sep', 9], ['24 Sep', 14], ['29 Sep', 21], ['—', 0], ['30 Sep', 18], ['26 Sep', 12], ['30 Sep', 27], ['18 Sep', 11], ['30 Sep', 34], ['22 Sep', 9], ['29 Sep', 16], ['—', 0], ['15 Sep', 8], ['25 Sep', 19]];
  const ltCols = [C('name', 'Employee'), C('late', 'Late Marks', 'n'), C('mins', 'Avg Minutes', 'nx'), C('ded', 'Deduction', 'nv'), C('last', 'Last Late')];
  const ltRows = EMP.map((e, i) => P(e, { late: ATT[i][3], mins: LATE[i][1], ded: ATT[i][3] >= 3 ? Math.round(e.gross / 30 / 2) * Math.floor(ATT[i][3] / 3) : 0, last: LATE[i][0] === '—' ? '—' : LATE[i][0] + ' 2026' }));
  const TO = [['Oct 2025', 3, 2], ['Nov 2025', 2, 1], ['Dec 2025', 1, 3], ['Jan 2026', 4, 2], ['Feb 2026', 3, 1], ['Mar 2026', 2, 2], ['Apr 2026', 5, 3], ['May 2026', 3, 1], ['Jun 2026', 2, 2], ['Jul 2026', 6, 1], ['Aug 2026', 4, 2], ['Sep 2026', 4, 1]];
  const QTR = ['Q2 FY 2025-26', 'Q2 FY 2025-26', 'Q2 FY 2025-26', 'Q3 FY 2025-26', 'Q3 FY 2025-26', 'Q3 FY 2025-26', 'Q4 FY 2025-26', 'Q4 FY 2025-26', 'Q4 FY 2025-26', 'Q1 FY 2026-27', 'Q1 FY 2026-27', 'Q1 FY 2026-27'];
  const toCols = [C('m', 'Month'), C('open', 'Opening', 'nx'), C('j', 'Joiners', 'n'), C('e', 'Exits', 'n'), C('close', 'Closing', 'nx'), C('rate', 'Attrition', 'xv')];
  const toRows = (() => { let h = 168; return TO.map((t, i) => { const o = { g: QTR[i], m: t[0], open: h, j: t[1], e: t[2] }; h = h + t[1] - t[2]; o.close = h; o.rate = pct(t[2], o.open); return o; }); })();
  const dcCols = [C('dept', 'Department'), C('hc', 'Headcount', 'n'), C('gross', 'Gross Salary', 'n'), C('stat', 'EOBI + PESSI', 'nv'), C('pf', 'PF Employer', 'nv'), C('ctc', 'Total CTC', 'n'), C('per', 'Per Employee', 'nx')];
  const dcRows = (() => {
    const hc = DEPTS.map((d) => d[2] + d[3] + d[4] + d[5]);
    const alloc = (total, w, step) => { const W = sum(w); let acc = 0; return w.map((x, i) => { if (i === w.length - 1) return total - acc; const v = Math.round((total * x) / W / step) * step; acc += v; return v; }); };
    const gross = alloc(21450000, DEPTS.map((d, i) => d[7] * hc[i]), 1000);
    const pessiW = DEPTS.map((d) => d[2] + d[4] + d[5]);
    const pessi = alloc(186600, pessiW, 60);
    const pf = alloc(612300, gross, 100);
    return DEPTS.map((d, i) => { const ctc = gross[i] + hc[i] * 1850 + pessi[i] + pf[i]; return { g: d[0], dept: d[1], hc: hc[i], gross: gross[i], stat: hc[i] * 1850 + pessi[i], pf: pf[i], ctc, per: Math.round(ctc / hc[i]) }; });
  })();

  /* ================================================================
     Filters, options, presets per studio
     ================================================================ */
  const SORT_GEN = [['Default', null], ['Name (A–Z)', '$text'], ['Amount', '$num']];
  const F = {
    search: (ph) => ({ kind: 'search', label: 'Find in Report', icon: 'search', placeholder: ph }),
    sort: (opts) => ({ kind: 'sort', label: 'Sort By', icon: 'arrow-up-down', options: opts || SORT_GEN }),
  };

  const STUDIOS = {
    finance: {
      module: 'Finance', moduleIcon: 'landmark', crumb: 'Financial Statements', title: 'Financial Report Studio',
      desc: 'Statements, ledgers and ratios from your live books, ready to review, print and share.', tagline: 'Numbers that tell the story',
      opts: [['value', 'Show comparative columns', true], ['zero', 'Include zero balances', false], ['group', 'Group by account type', true], ['desc', 'Show codes & notes', true]],
      filters: [
        { kind: 'date', label: 'Period', icon: 'calendar', options: ['Q1 FY 2026-27 (Jul–Sep)', 'September 2026', 'Year to date', 'Custom range'], date: '2026-09-30' },
        { kind: 'select', label: 'Branch', icon: 'building-2', options: ['All branches (consolidated)', ...BR] },
        { kind: 'select', label: 'Comparison', icon: 'columns-2', options: ['Same period last year', 'Previous period', 'Budget (v3)', 'None'] },
        { kind: 'radio', label: 'Account Level', icon: 'layers', options: ['Level 2 (groups)', 'Level 3', 'Level 4 (posting)'], def: 2 },
        { kind: 'toggle', label: 'Zero Balances', icon: 'circle-minus', text: 'Show zero balances', bind: 'zero' },
        F.search('Account, voucher or narration…'),
        F.sort(),
      ],
      presets: [
        { name: 'Board pack · Q1', sub: 'Profit & Loss · Comparative', star: true, set: { tab: 'pnl', view: 'Detail', opts: { value: true, group: true }, f: { Comparison: 'Same period last year' } } },
        { name: 'Month-end TB', sub: 'Trial Balance · Sep 2026', set: { tab: 'tb', view: 'Detail', opts: { value: true, zero: true }, f: { Period: 'September 2026' } } },
        { name: 'Bank summary', sub: 'Account Ledger · Summary', set: { tab: 'ledger', view: 'Summary', opts: { group: true } } },
        { name: 'Lender covenant', sub: 'Ratio Analysis · Benchmarks', set: { tab: 'ratio', view: 'Detail', opts: { value: true, desc: true } } },
      ],
      tabs: [
        { key: 'tb', label: 'Trial Balance', icon: 'scale', route: 'app/reports/trial-balance', report: {
          name: 'Trial Balance', cols: tbCols, rows: tbRows, group: 'g', groupLabel: 'Account type', period: '01 Jul – 30 Sep 2026',
          stats: [['scale', 'Closing Debits', Rs(341992600)], ['scale', 'Closing Credits', Rs(341992600)], ['circle-check', 'Difference', 'Rs 0.00']],
          summary: [['Opening (Dr = Cr)', Rs(238452000)], ['Movement (Dr = Cr)', Rs(108282600)], ['Closing (Dr = Cr)', Rs(341992600)]] } },
        { key: 'pnl', label: 'Profit & Loss', icon: 'trending-up', route: 'app/reports/pnl', report: {
          name: 'Income Statement', stmt: true, cols: plCols, rows: plRows, groupLabel: 'Section', period: 'Quarter ended 30 Sep 2026',
          stats: [['chart-column', 'Net Revenue', Rs(97000000)], ['trending-up', 'Gross Profit', Rs(31300000)], ['coins', 'Net Profit', Rs(6347400)]],
          summary: [['Gross margin', '32.3%'], ['Operating margin', '10.6%'], ['Net profit', Rs(6347400)]] } },
        { key: 'bs', label: 'Balance Sheet', icon: 'columns-2', route: 'app/reports/balance-sheet', report: {
          name: 'Statement of Financial Position', stmt: true, cols: bsCols, rows: bsRows, groupLabel: 'Section', period: 'As at 30 Sep 2026',
          stats: [['building-2', 'Total Assets', Rs(196910000)], ['wallet', 'Total Equity', Rs(114747400)], ['receipt', 'Total Liabilities', Rs(82162600)]],
          summary: [['Current ratio', '2.00 : 1'], ['Working capital', Rs(47377400)], ['Assets = Equity + Liabilities', Rs(196910000)]] } },
        { key: 'cf', label: 'Cash Flow', icon: 'waves', route: 'app/reports/cash-flow', report: {
          name: 'Statement of Cash Flows', stmt: true, cols: cfCols, rows: cfRows, groupLabel: 'Activity', period: 'Indirect method · Q1 FY 2026-27',
          stats: [['wallet', 'Opening Cash & Bank', Rs(19850000)], ['waves', 'Net Increase', Rs(1630000)], ['coins', 'Closing Cash & Bank', Rs(21480000)]],
          summary: [['Operating activities', Rs(5753000)], ['Investing activities', '(Rs 6,323,000)'], ['Financing activities', Rs(2200000)]] } },
        { key: 'gl', label: 'General Ledger', icon: 'book-open', route: 'app/reports/gl', report: {
          name: 'General Ledger', cols: glCols, rows: glRows, group: 'g', groupLabel: 'Account', period: '01 Sep – 30 Sep 2026',
          stats: [['book-open', 'Accounts', '3'], ['list', 'Entries', '308'], ['scale', 'Total Debits', Rs(48892000)]],
          summary: [['Total debits', Rs(48892000)], ['Total credits', Rs(46170000)], ['Accounts listed', '3 of 47']] } },
        { key: 'daybook', label: 'Day Book', icon: 'calendar', route: 'app/reports/day-book', report: {
          name: 'Day Book', cols: dbCols, rows: dbRows, group: 'g', groupLabel: 'Voucher type', period: 'Wednesday, 30 Sep 2026',
          stats: [['file-text', 'Vouchers Posted', '11'], ['scale', 'Total Debits', Rs(12486900)], ['receipt', 'Sales Invoiced', Rs(3835000)]],
          summary: [['Total debits', Rs(12486900)], ['Total credits', Rs(12486900)], ['Status', 'Balanced']] } },
        { key: 'ledger', label: 'Account Ledger', icon: 'wallet', report: {
          name: 'Account Ledger', subtitle: '1511 · Meezan Bank — 0123', cols: alCols, rows: alRows, group: 'g', groupLabel: 'Fortnight', period: '01 Sep – 30 Sep 2026',
          stats: [['wallet', 'Opening Balance', 'Rs ' + alOpen.replace(' Dr', '')], ['arrow-up-down', 'Transactions', '10'], ['coins', 'Closing Balance', Rs(12640000)]],
          summary: [['Receipts', Rs(sum(alRaw.map((r) => r[4])))], ['Payments', Rs(sum(alRaw.map((r) => r[5])))], ['Closing (agrees to TB)', Rs(12640000)]] } },
        { key: 'ratio', label: 'Ratio Analysis', icon: 'percent', report: {
          name: 'Ratio Analysis', cols: raCols, rows: raRows, group: 'g', groupLabel: 'Category', period: 'Q1 FY 2026-27 vs Q1 FY 2025-26',
          stats: [['trending-up', 'Net Margin', '6.5%'], ['scale', 'Current Ratio', '2.00 : 1'], ['percent', 'Debt to Equity', '0.37']],
          summary: [['Ratios on target', '12 of 14'], ['Watch', 'Current ratio, quick ratio'], ['Covenant DSCR', 'Met']] } },
      ],
    },

    inventory: {
      module: 'Inventory', moduleIcon: 'boxes', crumb: 'Report Studio', title: 'Inventory Report Studio',
      desc: 'Select a report, set your options and generate professional reports.', tagline: 'From Data to Decisions',
      opts: [['value', 'Show value columns', true], ['zero', 'Include zero stock items', false], ['group', 'Group by product class', true], ['desc', 'Show item description', true]],
      filters: [
        { kind: 'date', label: 'Date', icon: 'calendar-clock', options: ['As On Date', 'Date Range'], date: '2026-09-30' },
        { kind: 'select', label: 'Company', icon: 'building-2', col: 'brand', options: ['All Companies', 'Habib Packaging', 'HP', 'Double A', 'Ansell', 'Shan Foods', 'Reckitt', 'Nestlé', 'Philips', 'Pak Fan'] },
        { kind: 'select', label: 'Warehouse', icon: 'warehouse', col: 'wh', options: ['All Warehouses', ...BR] },
        { kind: 'radio', label: 'Report Scope', icon: 'tag', options: ['All Items', 'Product Class', 'Product', 'Stock Type'] },
        { kind: 'toggle', label: 'Overstock Rules', icon: 'layers', text: 'Show only overstock items', flag: 'over' },
        { kind: 'radio', label: 'Stock Basis', icon: 'coins', options: ['Cost Base', 'Sale Base'] },
        { kind: 'select', label: 'Group By', icon: 'boxes', groupBy: { 'Product Class': 'cls', Warehouse: 'wh', Company: 'brand' }, options: ['Product Class', 'Warehouse', 'Company'] },
        F.search('SKU, product or company…'),
        F.sort([['Product Name', '$text'], ['Quantity', 'qty'], ['Total Value', '$num']]),
      ],
      presets: [
        { name: 'Default Current Stock', sub: 'Current Stock · All Companies', set: { tab: 'current', view: 'Detail', opts: { value: true, zero: false, group: true, desc: true }, f: { Warehouse: 'All Warehouses', Company: 'All Companies', 'Group By': 'Product Class' } } },
        { name: 'Overstock - All Warehouses', sub: 'Over Stock · All Warehouses', star: true, set: { tab: 'over', view: 'Detail', opts: { group: true }, f: { 'Group By': 'Warehouse', Warehouse: 'All Warehouses' } } },
        { name: 'Lahore HQ - Cost Base', sub: 'Value · Lahore HQ', set: { tab: 'value', view: 'Detail', opts: { value: true }, f: { Warehouse: 'Lahore HQ', 'Stock Basis': 'Cost Base' } } },
        { name: 'Warehouse Stock - Summary', sub: 'Current Stock · Summary', set: { tab: 'current', view: 'Summary', opts: { group: true }, f: { 'Group By': 'Warehouse', Warehouse: 'All Warehouses' } } },
      ],
      tabs: [
        { key: 'current', label: 'Current Stock', icon: 'package', report: { name: 'Inventory Report', cols: invCols, rows: ITEMS, group: 'cls', groupLabel: 'Product class', period: 'As on 30 Sep 2026',
          stats: invStats(invPos, 'qty', 'val'), summary: [['Total Products', N(invPos.length, 0)], ['Total Quantity', N(invQty, 0)], ['Total Stock Value', Rs(invVal)]] } },
        { key: 'ason', label: 'Stock As On Date', icon: 'calendar-clock', report: { name: 'Inventory Report', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('wh', 'Warehouse'), C('open', 'Opening', 'nx'), C('inn', 'In', 'nx'), C('out', 'Out', 'nx'), C('qty', 'Closing', 'nx'), C('val', 'Value', 'nv')], rows: asOnRows, group: 'cls', groupLabel: 'Product class', period: 'Movement 01 Jul – 30 Sep 2026',
          stats: invStats(invPos, 'qty', 'val', 'Value on 30 Sep'), summary: [['Opening quantity', N(sum(ITEMS.map((i) => i.open)), 0)], ['Received / Issued', N(sum(ITEMS.map((i) => i.inn)), 0) + ' / ' + N(sum(ITEMS.map((i) => i.out)), 0)], ['Closing value', Rs(invVal)]] } },
        { key: 'over', label: 'Over Stock', icon: 'chart-column', report: { name: 'Inventory Report', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('wh', 'Warehouse'), C('qty', 'On Hand', 'nx'), C('max', 'Max Level', 'nx'), C('ex', 'Excess Qty', 'n'), C('exv', 'Excess Value', 'nv'), C('cover', 'Cover', 'x')], rows: overRows, group: 'cls', groupLabel: 'Product class', period: 'As on 30 Sep 2026',
          stats: [['chart-column', 'Overstocked Items', N(overRows.length, 0)], ['boxes', 'Excess Quantity', N(sum(overRows.map((r) => r.ex)), 0)], ['coins', 'Excess Value', Rs(sum(overRows.map((r) => r.exv)))]], summary: [['Items above max level', N(overRows.length, 0)], ['Excess quantity', N(sum(overRows.map((r) => r.ex)), 0)], ['Capital tied up', Rs(sum(overRows.map((r) => r.exv)))]] } },
        { key: 'list', label: 'Stock List', icon: 'list', report: { name: 'Inventory Report', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('cls', 'Class'), C('brand', 'Company'), C('uom', 'UoM'), C('reorder', 'Reorder Lvl', 'nx'), C('rate', 'Sale Rate', 'nxv'), C('cost', 'Cost', 'nxv')], rows: listRows, group: 'cls', groupLabel: 'Product class', period: 'Item master · active items',
          stats: [['list', 'Active Items', N(ITEMS.length, 0)], ['tag', 'Product Classes', '5'], ['scan-barcode', 'Barcoded', N(ITEMS.length - 2, 0)]], summary: [['Active items', N(ITEMS.length, 0)], ['Out of stock', '2'], ['Classes', '5']] } },
        { key: 'minus', label: 'Minus Stock', icon: 'circle-minus', report: { name: 'Inventory Report', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('wh', 'Warehouse'), C('qty', 'Book Qty', 'nx'), C('grn', 'Pending GRN', 'nx'), C('sv', 'Shortfall Value', 'nv'), C('doc', 'Last Issue')], rows: minusRows, group: 'wh', groupLabel: 'Warehouse', period: 'As on 30 Sep 2026',
          stats: [['circle-minus', 'Items in Minus', '6'], ['boxes', 'Minus Quantity', N(sum(minusRows.map((r) => r.qty)), 0)], ['coins', 'Shortfall Value', Rs(-sum(minusRows.map((r) => r.sv)))]], summary: [['Items in minus', '6'], ['Pending GRN qty', N(sum(minusRows.map((r) => r.grn)), 0)], ['Shortfall at cost', Rs(-sum(minusRows.map((r) => r.sv)))]] } },
        { key: 'check', label: 'Checking', icon: 'circle-check', report: { name: 'Stock Count Report', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('wh', 'Warehouse'), C('book', 'Book Qty', 'nx'), C('phys', 'Counted', 'nx'), C('var', 'Variance', 'n'), C('vv', 'Variance Value', 'nv'), C('stat', 'Status')], rows: checkRows, group: 'wh', groupLabel: 'Warehouse', period: 'Physical count · 30 Sep 2026',
          stats: [['circle-check', 'Items Counted', N(ITEMS.length, 0)], ['scale', 'Matched', N(VAR.filter((v) => v === 0).length, 0)], ['coins', 'Net Variance', Rs(sum(checkRows.map((r) => r.vv)))]], summary: [['Accuracy', pct(VAR.filter((v) => v === 0).length, VAR.length)], ['Short items', N(VAR.filter((v) => v < 0).length, 0)], ['Net variance', Rs(sum(checkRows.map((r) => r.vv)))]] } },
        { key: 'value', label: 'Value', icon: 'coins', report: { name: 'Inventory Valuation', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('cls', 'Class'), C('qty', 'Qty', 'nx'), C('cost', 'Avg Cost', 'nxv'), C('val', 'Value', 'nv'), C('sh', '% of Total', 'x')], rows: valRows, group: 'cls', groupLabel: 'Product class', period: 'Weighted average · 30 Sep 2026',
          stats: invStats(invPos, 'qty', 'val'), summary: [['Valuation method', 'Weighted average'], ['Top class', 'Packaging'], ['Total value', Rs(invVal)]] } },
        { key: 'move', label: 'Movement', icon: 'history', report: { name: 'Stock Movement', cols: [C('sku', 'SKU'), C('name', 'Product Name'), C('open', 'Opening', 'nx'), C('inn', 'Receipts', 'nx'), C('out', 'Issues', 'nx'), C('qty', 'Closing', 'nx'), C('turn', 'Turnover', 'x'), C('last', 'Last Movement')], rows: mvRows, group: 'cls', groupLabel: 'Product class', period: '01 Jul – 30 Sep 2026',
          stats: [['history', 'Receipts', N(sum(ITEMS.map((i) => i.inn)), 0)], ['arrow-up-down', 'Issues', N(sum(ITEMS.map((i) => i.out)), 0)], ['boxes', 'Closing Qty', N(invQty, 0)]], summary: [['Receipts (qty)', N(sum(ITEMS.map((i) => i.inn)), 0)], ['Issues (qty)', N(sum(ITEMS.map((i) => i.out)), 0)], ['Slow movers', '3 items']] } },
      ],
    },

    receivables: {
      module: 'Receivables', moduleIcon: 'hand-coins', crumb: 'AR Ageing & Reports', title: 'Sales & Receivables Studio',
      desc: 'Ageing, registers and statements for every customer, as at 01 Oct 2026.', tagline: 'Every rupee, accounted for',
      opts: [['value', 'Show ageing & tax columns', true], ['zero', 'Include zero balances', false], ['group', 'Group by branch', true], ['desc', 'Show terms & notes', true]],
      filters: [
        { kind: 'date', label: 'As On', icon: 'calendar', options: ['As on date', 'Date range'], date: '2026-10-01' },
        { kind: 'select', label: 'Customer', icon: 'users', col: 'cust', options: ['All customers', 'Lucky Cement', 'City Mart Superstores', 'Engro Foods', 'Shifa International', 'Interloop Ltd', 'Al-Fatah Stores', 'Packages Ltd', 'Hashoo Hotels', 'Metro Cash & Carry', 'Fatima Group'] },
        { kind: 'select', label: 'Branch', icon: 'building-2', col: 'city', options: ['All branches', ...BR] },
        { kind: 'radio', label: 'Ageing Basis', icon: 'hourglass', options: ['By due date', 'By invoice date'] },
        F.search('Customer, invoice or note…'),
        F.sort(),
      ],
      presets: [
        { name: 'Month-end ageing', sub: 'AR Ageing · All branches', star: true, set: { tab: 'ageing', view: 'Detail', opts: { value: true, group: true }, f: { Branch: 'All branches' } } },
        { name: 'Karachi collections', sub: 'AR Ageing · Karachi', set: { tab: 'ageing', view: 'Detail', f: { Branch: 'Karachi' } } },
        { name: 'GST output · Sep', sub: 'GST Output · Detail', set: { tab: 'gst', view: 'Detail', opts: { value: true } } },
        { name: 'Top customers', sub: 'Sales by Customer · Summary', set: { tab: 'bycust', view: 'Summary', opts: { group: true } } },
      ],
      tabs: [
        { key: 'ageing', label: 'AR Ageing', icon: 'hourglass', route: 'app/receivables/ageing', report: { name: 'Receivables Ageing', cols: arCols, rows: arRows, group: 'city', groupLabel: 'Branch', period: 'As at 01 Oct 2026',
          stats: [['users', 'Customers', '9'], ['hand-coins', 'Total Receivable', Rs(8925470)], ['hourglass', 'Overdue 90+', Rs(174950)]], summary: [['Current (76.8%)', Rs(6855300)], ['Overdue', Rs(2070170)], ['DSO', '38 days']] } },
        { key: 'register', label: 'Sales Register', icon: 'receipt', report: { name: 'Sales Register', cols: srCols, rows: srRows, group: 'city', groupLabel: 'Branch', period: '01 Sep – 30 Sep 2026',
          stats: [['receipt', 'Documents', N(srRows.length, 0)], ['chart-column', 'Net Sales', Rs(sum(srRows.map((r) => r.net)))], ['percent', 'Output Tax', Rs(sum(srRows.map((r) => r.gst)))]], summary: [['Invoices', '12'], ['Credit notes', '1'], ['Gross invoiced', Rs(sum(srRows.map((r) => r.tot)))]] } },
        { key: 'statement', label: 'Customer Statement', icon: 'file-text', report: { name: 'Customer Statement', subtitle: 'Lucky Cement · Karachi', cols: csCols, rows: csRows, group: 'g', groupLabel: 'Period', period: '01 Sep – 30 Sep 2026',
          stats: [['wallet', 'Opening Balance', Rs(2650000)], ['receipt', 'Invoiced', Rs(2478000)], ['coins', 'Closing Balance', Rs(2478000)]], summary: [['Invoiced', Rs(2478000)], ['Received', Rs(2650000)], ['Amount due', Rs(2478000)]] } },
        { key: 'bycust', label: 'Sales by Customer', icon: 'users', report: { name: 'Sales Analysis', cols: sbcCols, rows: sbcRows, group: 'city', groupLabel: 'Branch', period: 'Q1 FY 2026-27',
          stats: [['users', 'Customers', '11'], ['chart-column', 'Net Sales', Rs(sbcTotal)], ['trending-up', 'Top Customer', 'Lucky Cement']], summary: [['Net sales (goods + services)', Rs(sbcTotal)], ['Top 3 share', pct(16420000 + 14850000 + 12960000, sbcTotal)], ['Invoices', N(sum(sbcRaw.map((r) => r[1])), 0)]] } },
        { key: 'byitem', label: 'Sales by Item', icon: 'package', report: { name: 'Sales Analysis', cols: sbiCols, rows: sbiRows, group: 'cls', groupLabel: 'Product class', period: 'Q1 FY 2026-27',
          stats: [['package', 'Items Sold', N(sbiRows.length, 0)], ['boxes', 'Units', N(sum(sbiRows.map((r) => r.qty)), 0)], ['coins', 'Net Sales', Rs(sum(sbiRows.map((r) => r.net)))]], summary: [['Items', N(sbiRows.length, 0)], ['Units sold', N(sum(sbiRows.map((r) => r.qty)), 0)], ['Net sales', Rs(sum(sbiRows.map((r) => r.net)))]] } },
        { key: 'gst', label: 'GST Output', icon: 'percent', report: { name: 'Sales Tax Output', subtitle: 'Annex-C · September 2026', cols: gstCols, rows: gstRows, group: 'city', groupLabel: 'Branch', period: 'Tax period Sep 2026',
          stats: [['receipt', 'Documents', N(gstRows.length, 0)], ['percent', 'Output Tax', Rs(sum(gstRows.map((r) => r.gst)))], ['coins', 'Further Tax', Rs(sum(gstRows.map((r) => r.ft)))]], summary: [['Value excl. tax', Rs(sum(gstRows.map((r) => r.net)))], ['Sales tax @ 18%', Rs(sum(gstRows.map((r) => r.gst)))], ['Further tax @ 4%', Rs(sum(gstRows.map((r) => r.ft)))]] } },
      ],
    },

    payables: {
      module: 'Payables', moduleIcon: 'wallet', crumb: 'AP Ageing & Reports', title: 'Purchases & Payables Studio',
      desc: 'Vendor ageing, purchase registers and withholding tax, net of WHT withheld.', tagline: 'Pay right, pay on time',
      opts: [['value', 'Show ageing & tax columns', true], ['zero', 'Include zero balances', false], ['group', 'Group by branch', true], ['desc', 'Show terms & notes', true]],
      filters: [
        { kind: 'date', label: 'As On', icon: 'calendar', options: ['As on date', 'Date range'], date: '2026-10-01' },
        { kind: 'select', label: 'Vendor', icon: 'building-2', col: 'vend', options: ['All vendors', 'Siemens Pakistan', 'Habib Packaging', 'Nishat Mills', 'LESCO', 'Pak Suzuki Spares', 'TCS Logistics', 'K-Electric', 'Shan Foods', 'Daraz Business', 'PTCL'] },
        { kind: 'select', label: 'Branch', icon: 'warehouse', col: 'city', options: ['All branches', ...BR] },
        { kind: 'radio', label: 'Ageing Basis', icon: 'hourglass', options: ['By due date', 'By bill date'] },
        F.search('Vendor, bill or note…'),
        F.sort(),
      ],
      presets: [
        { name: 'Payment run prep', sub: 'AP Ageing · Due this week', star: true, set: { tab: 'ageing', view: 'Detail', opts: { value: true, group: true } } },
        { name: 'Karachi vendors', sub: 'AP Ageing · Karachi', set: { tab: 'ageing', f: { Branch: 'Karachi' } } },
        { name: 'WHT return · Sep', sub: 'WHT Deducted · by section', set: { tab: 'wht', view: 'Detail', opts: { group: true } } },
        { name: 'Spend summary', sub: 'Purchases by Vendor · Summary', set: { tab: 'byvendor', view: 'Summary' } },
      ],
      tabs: [
        { key: 'ageing', label: 'AP Ageing', icon: 'hourglass', route: 'app/payables/ageing', report: { name: 'Payables Ageing', cols: apCols, rows: apRows, group: 'city', groupLabel: 'Branch', period: 'As at 01 Oct 2026',
          stats: [['building-2', 'Vendors', '9'], ['wallet', 'Total Payable', Rs(5437230)], ['hourglass', 'Disputed 90+', Rs(34500)]], summary: [['Current (69.5%)', Rs(3777950)], ['Overdue', Rs(1659280)], ['DPO', '36 days']] } },
        { key: 'register', label: 'Purchase Register', icon: 'receipt', report: { name: 'Purchase Register', cols: prCols, rows: prRows, group: 'city', groupLabel: 'Branch', period: '01 Sep – 30 Sep 2026',
          stats: [['receipt', 'Bills', N(prRows.length, 0)], ['chart-column', 'Net Purchases', Rs(sum(prRows.map((r) => r.net)))], ['percent', 'Input Tax', Rs(sum(prRows.map((r) => r.gst)))]], summary: [['Bills', N(prRows.length, 0)], ['Input tax claimable', Rs(sum(prRows.map((r) => r.gst)))], ['Gross billed', Rs(sum(prRows.map((r) => r.tot)))]] } },
        { key: 'statement', label: 'Vendor Statement', icon: 'file-text', report: { name: 'Vendor Statement', subtitle: 'Siemens Pakistan · Karachi', cols: csCols, rows: vsRows, group: 'g', groupLabel: 'Period', period: '01 Sep – 30 Sep 2026',
          stats: [['wallet', 'Opening Balance', Rs(3939000)], ['receipt', 'Billed', Rs(1638500)], ['coins', 'Closing Balance', Rs(2937500)]], summary: [['Billed', Rs(1638500)], ['Paid', Rs(2640000)], ['Amount payable', Rs(2937500)]] } },
        { key: 'wht', label: 'WHT Deducted', icon: 'percent', report: { name: 'Withholding Tax Statement', cols: whtCols, rows: whtRows, group: 'g', groupLabel: 'Section', period: 'September 2026',
          stats: [['file-text', 'Payments', N(whtRows.length, 0)], ['coins', 'Gross Paid', Rs(sum(whtRows.map((r) => r.gross)))], ['percent', 'Tax Withheld', Rs(sum(whtRows.map((r) => r.wht)))]], summary: [['Tax withheld', Rs(sum(whtRows.map((r) => r.wht)))], ['Deposit due', '15 Oct 2026'], ['CPR status', 'Pending']] } },
        { key: 'byvendor', label: 'Purchases by Vendor', icon: 'building-2', report: { name: 'Purchase Analysis', cols: pbvCols, rows: pbvRows, group: 'g', groupLabel: 'Category', period: 'Q1 FY 2026-27',
          stats: [['building-2', 'Vendors', '10'], ['chart-column', 'Net Purchases', Rs(pbvTotal)], ['trending-up', 'Top Vendor', 'Nishat Mills']], summary: [['Net purchases', Rs(pbvTotal)], ['Top 3 share', pct(18420000 + 14250000 + 12960000, pbvTotal)], ['Bills', N(sum(pbvRaw.map((r) => r[2])), 0)]] } },
      ],
    },

    payroll: {
      module: 'Payroll', moduleIcon: 'banknote', crumb: 'Statutory Reports', title: 'Payroll Report Studio',
      desc: 'Registers, bank advice and statutory returns from posted payroll runs.', tagline: 'Paid right, filed on time',
      opts: [['value', 'Show earning columns', true], ['zero', 'Include zero rows', false], ['group', 'Group by department', true], ['desc', 'Show IDs & designations', true]],
      filters: [
        { kind: 'select', label: 'Pay Month', icon: 'calendar', options: ['September 2026 · PR-2026-09', 'August 2026 · PR-2026-08', 'FY 2026-27 (Jul–Sep)'] },
        { kind: 'select', label: 'Department', icon: 'users', col: 'dept', options: ['All departments', 'Administration', 'Finance', 'Human Resources', 'IT', 'Operations', 'Procurement', 'Sales', 'Warehouse'] },
        { kind: 'select', label: 'Branch', icon: 'building-2', col: 'branch', options: ['All branches', ...BR] },
        { kind: 'radio', label: 'Pay Group', icon: 'layers', col: 'pg', options: ['All staff', 'Management', 'Staff'] },
        F.search('Employee, ID or CNIC…'),
        F.sort(),
      ],
      presets: [
        { name: 'Monthly register', sub: 'Payroll Register · Sep 2026', star: true, set: { tab: 'register', view: 'Detail', opts: { value: true, group: true } } },
        { name: 'Bank upload', sub: 'Bank Advice · by bank', set: { tab: 'bank', view: 'Detail', opts: { group: true } } },
        { name: 'EOBI filing', sub: 'EOBI PR-01 · all insured', set: { tab: 'eobi', view: 'Detail' } },
        { name: 'Management only', sub: 'Payroll Register · Management', set: { tab: 'register', f: { 'Pay Group': 'Management' } } },
      ],
      tabs: [
        { key: 'register', label: 'Payroll Register', icon: 'file-text', route: 'app/hr/payroll/reports', report: { name: 'Payroll Register', subtitle: 'PR-2026-09 · head office', cols: regCols, rows: regRows, group: 'dept', groupLabel: 'Department', period: 'September 2026',
          stats: [['users', 'Employees (run)', '186'], ['coins', 'Gross Payroll', Rs(21450000)], ['wallet', 'Net Payroll', Rs(19097980)]], summary: [['Listed employees', '14 of 186'], ['Listed gross', Rs(regTot.gross)], ['Listed net pay', Rs(regTot.net)]] } },
        { key: 'bank', label: 'Bank Advice', icon: 'building-2', report: { name: 'Bank Advice Letter', cols: advCols, rows: advRows, group: 'bank', groupLabel: 'Bank', period: 'Value date 29 Sep 2026',
          stats: [['building-2', 'Meezan Bank — 0123', Rs(14742580)], ['building-2', 'HBL — 8721 IBFT', Rs(3985400)], ['wallet', 'Cheque / Cash', Rs(370000)]], summary: [['Total transfer', Rs(19097980)], ['Instruction ref', 'BA-2026-09'], ['Sent', '29 Sep 2026']] } },
        { key: 'eobi', label: 'EOBI PR-01', icon: 'receipt', report: { name: 'EOBI Contribution Statement', subtitle: 'PR-01 · Employer LHR-0412-3399', cols: eobiCols, rows: eobiRows, group: 'branch', groupLabel: 'Branch', period: 'September 2026',
          stats: [['users', 'Insured Persons', '186'], ['coins', 'Employee 1%', Rs(68820)], ['coins', 'Employer 5%', Rs(344100)]], summary: [['Minimum wage', Rs(37000)], ['Total contribution', Rs(412920)], ['Due date', '15 Oct 2026']] } },
        { key: 'pessi', label: 'PESSI', icon: 'circle-check', report: { name: 'PESSI Contribution', subtitle: 'Punjab Employees Social Security', cols: pessiCols, rows: pessiRows, group: 'branch', groupLabel: 'Branch', period: 'September 2026',
          stats: [['users', 'Secured Persons', '112'], ['coins', 'Contributory Wages', Rs(3110000)], ['percent', 'Employer 6%', Rs(186600)]], summary: [['Karachi staff', 'Filed under SESSI (24)'], ['Contribution', Rs(186600)], ['Due date', '15 Oct 2026']] } },
        { key: 's149', label: 'Salary Tax u/s 149', icon: 'percent', report: { name: 'Salary Tax Statement', subtitle: 'Section 149 · Annex-C', cols: s149Cols, rows: s149Rows, group: 'dept', groupLabel: 'Department', period: 'September 2026',
          stats: [['users', 'Taxable Employees', '132'], ['coins', 'Taxable Salary', Rs(18940500)], ['percent', 'Tax Deducted', Rs(1286400)]], summary: [['Listed tax', Rs(regTot.tax)], ['IRIS status', 'Ready'], ['CPR due', '15 Oct 2026']] } },
        { key: 'pf', label: 'PF Register', icon: 'wallet', report: { name: 'Provident Fund Register', cols: pfCols, rows: pfRows, group: 'dept', groupLabel: 'Department', period: 'September 2026',
          stats: [['users', 'Members', '148'], ['coins', 'Sep Contribution', Rs(1224600)], ['wallet', 'Fund Balance', Rs(48620300)]], summary: [['Listed contribution', Rs(regTot.pf * 2)], ['Profit rate', '15% p.a.'], ['Status', 'Reconciled']] } },
      ],
    },

    hr: {
      module: 'Workforce', moduleIcon: 'users', crumb: 'HR Reports', title: 'HR Report Studio',
      desc: 'Headcount, attendance, leave and turnover for Al-Noor Enterprises, as of 01 Oct 2026.', tagline: 'People are the numbers',
      opts: [['value', 'Show value columns', true], ['zero', 'Include zero rows', false], ['group', 'Group by department', true], ['desc', 'Show IDs & designations', true]],
      filters: [
        { kind: 'select', label: 'Month', icon: 'calendar', options: ['September 2026', 'August 2026', 'Last 12 months', 'FY 2025-26'] },
        { kind: 'select', label: 'Department', icon: 'users', col: 'dept', options: ['All departments', 'Administration', 'Finance', 'Human Resources', 'IT', 'Operations', 'Procurement', 'Sales', 'Warehouse'] },
        { kind: 'select', label: 'Branch', icon: 'building-2', col: 'branch', options: ['All branches', ...BR] },
        { kind: 'radio', label: 'Pay Group', icon: 'layers', col: 'pg', options: ['All staff', 'Management', 'Staff'] },
        F.search('Employee or department…'),
        F.sort(),
      ],
      presets: [
        { name: 'Board headcount', sub: 'Headcount · by division', star: true, set: { tab: 'headcount', view: 'Detail', opts: { group: true } } },
        { name: 'Late-comers', sub: 'Late Arrivals · Sep 2026', set: { tab: 'late', view: 'Detail', opts: { zero: false } } },
        { name: 'Leave liability', sub: 'Leave Balances · value', set: { tab: 'leave', opts: { value: true } } },
        { name: 'Cost by department', sub: 'Department Cost · Summary', set: { tab: 'cost', view: 'Summary' } },
      ],
      tabs: [
        { key: 'headcount', label: 'Headcount', icon: 'users', route: 'app/hr/reports', report: { name: 'Headcount Report', cols: hcCols, rows: hcRows, group: 'g', groupLabel: 'Division', period: 'As of 01 Oct 2026',
          stats: [['users', 'Headcount', '186'], ['trending-up', '12-month Growth', '+18 (10.7%)'], ['percent', 'Female', '24% (45)']], summary: [['Active employees', '186'], ['Largest department', 'Sales (42)'], ['Average tenure', '3.8 yrs']] } },
        { key: 'attendance', label: 'Attendance Summary', icon: 'calendar-clock', report: { name: 'Attendance Summary', cols: attCols, rows: attRows, group: 'dept', groupLabel: 'Department', period: 'September 2026 · 26 working days',
          stats: [['circle-check', 'Present Rate', '96.1%'], ['hourglass', 'Late Marks', '412'], ['history', 'Overtime Hours', N(sum(ATT.map((a) => a[4])), 0) + ' (listed)']], summary: [['Working days', '26'], ['Listed absences', N(sum(ATT.map((a) => a[1])), 0)], ['Listed late marks', N(sum(ATT.map((a) => a[3])), 0)]] } },
        { key: 'leave', label: 'Leave Balances', icon: 'calendar', report: { name: 'Leave Balances', cols: lvCols, rows: lvRows, group: 'dept', groupLabel: 'Department', period: 'As of 30 Sep 2026',
          stats: [['calendar', 'Annual Days Due', N(sum(LV.map((l) => l[0])), 0) + ' (listed)'], ['users', 'On Leave Today', '7'], ['coins', 'Leave Liability', 'Rs 4,100,000']], summary: [['Listed encashment', Rs(sum(lvRows.map((r) => r.enc)))], ['Company liability', 'Rs 4.1M'], ['Carry-forward cap', '30 days']] } },
        { key: 'late', label: 'Late Arrivals', icon: 'hourglass', report: { name: 'Late Arrivals', cols: ltCols, rows: ltRows, group: 'branch', groupLabel: 'Branch', period: 'September 2026 · grace 15 min',
          stats: [['hourglass', 'Late Marks (all)', '412'], ['users', 'Repeat (3+)', N(ATT.filter((a) => a[3] >= 3).length, 0) + ' listed'], ['coins', 'Deductions', Rs(sum(ltRows.map((r) => r.ded)))]], summary: [['Policy', '3 lates = ½ day'], ['Listed deductions', Rs(sum(ltRows.map((r) => r.ded)))], ['Worst branch', 'Lahore HQ']] } },
        { key: 'turnover', label: 'Turnover', icon: 'history', report: { name: 'Turnover Report', cols: toCols, rows: toRows, group: 'g', groupLabel: 'Quarter', period: 'Oct 2025 – Sep 2026',
          stats: [['users', 'Headcount 168 → 186', '+18'], ['trending-up', 'Joiners', '39'], ['circle-minus', 'Exits', '21 (11.4%)']], summary: [['Annualised attrition', '11.4%'], ['Voluntary exits', '85%'], ['Net change', '+18']] } },
        { key: 'cost', label: 'Department Cost', icon: 'coins', report: { name: 'Department Cost', cols: dcCols, rows: dcRows, group: 'g', groupLabel: 'Division', period: 'September 2026 · monthly CTC',
          stats: [['coins', 'Total CTC', Rs(sum(dcRows.map((r) => r.ctc)))], ['users', 'Headcount', '186'], ['wallet', 'Cost per Employee', Rs(121468)]], summary: [['Gross salary', Rs(21450000)], ['Employer contributions', Rs(sum(dcRows.map((r) => r.ctc)) - 21450000)], ['Total CTC', Rs(sum(dcRows.map((r) => r.ctc)))]] } },
      ],
    },
  };
  window.FS_STUDIOS = STUDIOS;

  /* ================================================================
     ENGINE
     ================================================================ */
  const INST = {};
  const defF = (f) => (f.kind === 'toggle' ? 'off' : f.kind === 'search' ? '' : f.kind === 'sort' ? f.options[0][0] : f.options[f.def || 0]);
  const fid = (key, i) => 'rst-' + key + '-f' + i;

  function mount(key) {
    const cfg = STUDIOS[key];
    const root = document.createElement('div');
    root.className = 'rst-page';
    root.dataset.studioKey = key;
    const S = {
      tab: cfg.tabs[0].key, view: 'Detail', fmt: 'PDF', zoom: 100, fit: true, page: 1, two: false, filters: true,
      opts: Object.fromEntries(cfg.opts.map((o) => [o[0], o[2]])),
      f: Object.fromEntries(cfg.filters.map((f) => [f.label, defF(f)])),
      dir: 'Ascending', dates: Object.fromEntries(cfg.filters.filter((f) => f.date).map((f) => [f.label, f.date])),
    };
    S.af = Object.assign({}, S.f);
    S.adir = S.dir;
    const inst = { key, cfg, root, S, presets: cfg.presets.slice(), W: 640 };
    INST[key] = inst;
    root.innerHTML = shellHTML(inst);
    inst.$ = (sel) => root.querySelector(sel);
    inst.stage = inst.$('.rst-stage');
    inst.box = inst.$('.rst-zoom-box');
    inst.zoomer = inst.$('.rst-zoomer');
    wire(inst);
    renderAll(inst);
    if (window.ResizeObserver) {
      let raf = 0;
      new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => layout(inst)); }).observe(inst.stage);
    }
    return inst;
  }

  const tabOf = (inst, k) => inst.cfg.tabs.find((t) => t.key === (k || inst.S.tab)) || inst.cfg.tabs[0];

  /* ---------------- shell markup */
  function shellHTML(inst) {
    const c = inst.cfg;
    return `
    <div class="rst-hero">
      <div class="rst-hero-top">
        <span class="rst-module"><span class="rst-cube"><i data-lucide="${c.moduleIcon}"></i></span>${esc(c.module)}</span>
        <span class="rst-crumb"><i data-lucide="house"></i><a href="#/app/reports">Reports</a><i data-lucide="chevron-right"></i><b>${esc(c.crumb)}</b></span>
      </div>
      <div class="rst-hero-row">
        <div><h1>${esc(c.title)}</h1><p>${esc(c.desc)}</p></div>
        <em class="rst-tagline">${esc(c.tagline)}</em>
      </div>
    </div>
    <div class="rst-tabs" role="tablist" aria-label="Report type"><span class="rst-tab-ind" aria-hidden="true"></span>
      ${c.tabs.map((t) => `<button type="button" role="tab" data-tabkey="${t.key}" aria-selected="false"><i data-lucide="${t.icon}"></i><span>${esc(t.label)}</span></button>`).join('')}
    </div>
    <div class="rst-grid">
      <div class="rst-fcol"><aside class="rst-panel rst-filters" aria-label="Filters"></aside></div>
      <section class="rst-panel rst-viewer" aria-label="Report preview">
        <div class="rst-toolbar">
          <button type="button" class="rst-tool rst-show-filters" data-act="filters-open" title="Show filters"><i data-lucide="sliders-horizontal"></i><span>Filters</span></button>
          <button type="button" class="rst-tool" data-act="prev" aria-label="Previous page"><i data-lucide="chevron-left"></i></button>
          <span class="rst-pageno" aria-live="polite"></span>
          <button type="button" class="rst-tool" data-act="next" aria-label="Next page"><i data-lucide="chevron-right"></i></button>
          <span class="rst-zoom"><button type="button" data-act="zoom-out" aria-label="Zoom out"><i data-lucide="minus"></i></button><b class="rst-zoomval">100%</b><button type="button" data-act="zoom-in" aria-label="Zoom in"><i data-lucide="plus"></i></button></span>
          <button type="button" class="rst-tool wide" data-act="fit" title="Fit width"><i data-lucide="square"></i><span>Fit Width</span></button>
          <button type="button" class="rst-tool wide" data-act="two" title="Two pages" aria-pressed="false"><i data-lucide="columns-2"></i><span>Two Pages</span></button>
          <span class="rst-tool-gap"></span>
          <button type="button" class="rst-tool tall" data-act="download"><i data-lucide="download"></i><small>Download</small></button>
          <button type="button" class="rst-tool tall" data-act="print"><i data-lucide="printer"></i><small>Print</small></button>
          <button type="button" class="rst-tool tall" data-act="fullscreen"><span class="rst-fs-ico"><i data-lucide="maximize"></i></span><small>Fullscreen</small></button>
        </div>
        <div class="rst-canvas">
          <div class="rst-thumbs" role="listbox" aria-label="Pages"></div>
          <div class="rst-stage"><div class="rst-zoom-box"><div class="rst-zoomer"></div></div></div>
        </div>
      </section>
      <aside class="rst-side">
        <div class="rst-panel rst-options"></div>
        <div class="rst-panel rst-presets"></div>
      </aside>
    </div>`;
  }

  /* ---------------- filters panel */
  function fieldHTML(inst, f, i) {
    const v = inst.S.f[f.label];
    const id = fid(inst.key, i);
    const sel = (opts, cur, attr) => `<label class="rst-select"><select ${attr} aria-label="${esc(f.label)}">${opts.map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select><i data-lucide="chevron-down"></i></label>`;
    let body = '';
    if (f.kind === 'select') body = sel(f.options, v, `data-f="${i}"`);
    if (f.kind === 'date') body = sel(f.options, v, `data-f="${i}"`) + `<label class="rst-select rst-date"><input type="date" data-date="${i}" value="${esc(inst.S.dates[f.label])}" aria-label="${esc(f.label)} date"></label>`;
    if (f.kind === 'radio') body = `<div class="rst-radios" role="radiogroup">${f.options.map((o) => `<label class="${o === v ? 'on' : ''}"><input type="radio" name="${id}" value="${esc(o)}" data-f="${i}"${o === v ? ' checked' : ''}><i></i>${esc(o)}</label>`).join('')}</div>`;
    if (f.kind === 'toggle') body = `<label class="rst-switch-row"><input type="checkbox" class="rst-sw-input" data-f="${i}"${(f.bind ? inst.S.opts[f.bind] : v === 'on') ? ' checked' : ''}><span class="rst-switch" aria-hidden="true"></span><span>${esc(f.text)}</span></label>`;
    if (f.kind === 'search') body = `<label class="rst-select rst-search"><i data-lucide="search"></i><input type="search" data-f="${i}" value="${esc(v)}" placeholder="${esc(f.placeholder)}" aria-label="${esc(f.label)}"></label>`;
    if (f.kind === 'sort') body = `<div class="rst-sort">${sel(f.options.map((o) => o[0]), v, `data-f="${i}"`)}${sel(['Ascending', 'Descending'], inst.S.dir, 'data-dir')}</div>`;
    return `<div class="rst-fld" data-fld="${i}"><div class="rst-fld-head"><i data-lucide="${f.icon}"></i><b>${esc(f.label)}</b></div>${body}</div>`;
  }
  function renderFilters(inst) {
    const el = inst.$('.rst-filters');
    el.innerHTML = `<div class="rst-panel-head"><i data-lucide="sliders-horizontal"></i><b>Filters</b><button type="button" class="rst-x" data-act="filters-close" aria-label="Close filters"><i data-lucide="x"></i></button></div>
      <div class="rst-fields">${inst.cfg.filters.map((f, i) => fieldHTML(inst, f, i)).join('')}</div>
      <button type="button" class="rst-primary rst-apply" data-act="apply"><span class="rst-fill"></span><i data-lucide="filter"></i><span>Apply Filters</span></button>`;
  }

  /* ---------------- options + presets */
  function renderOptions(inst) {
    const S = inst.S, c = inst.cfg;
    inst.$('.rst-options').innerHTML = `
      <div class="rst-panel-head"><i data-lucide="settings-2"></i><b>Report Options</b></div>
      <div class="rst-fld" data-opt="type"><div class="rst-fld-head plain"><b>Report Type</b></div>
        <label class="rst-select"><select data-act-change="type" aria-label="Report type">${c.tabs.map((t) => `<option value="${t.key}"${t.key === S.tab ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select><i data-lucide="chevron-down"></i></label></div>
      <div class="rst-fld" data-opt="view"><div class="rst-fld-head plain"><b>View Mode</b></div>
        <div class="rst-seg" role="group">${['Detail', 'Summary'].map((v) => `<button type="button" data-view="${v}" class="${S.view === v ? 'on' : ''}" aria-pressed="${S.view === v}">${v}</button>`).join('')}</div></div>
      <div class="rst-checks">${c.opts.map((o) => `<label data-opt="${o[0]}"><input type="checkbox" data-optk="${o[0]}"${S.opts[o[0]] ? ' checked' : ''}><span>${esc(o[1])}</span><span class="rst-switch" aria-hidden="true"></span></label>`).join('')}</div>
      <div class="rst-panel-head sub"><i data-lucide="file-output"></i><b>Output Format</b></div>
      <div class="rst-seg three" role="group" data-opt="fmt">${['PDF', 'Excel', 'Print'].map((f) => `<button type="button" data-fmt="${f}" class="${S.fmt === f ? 'on' : ''}" aria-pressed="${S.fmt === f}">${f}</button>`).join('')}</div>
      <button type="button" class="rst-primary rst-generate" data-act="generate"><span class="rst-fill"></span><i data-lucide="file-check"></i><span class="rst-gen-label">Generate Report</span></button>`;
  }
  function presetHTML(p, i, cls) {
    return `<button type="button" class="rst-preset ${cls || ''}" data-preset="${i}">${p.star ? '<i class="rst-star" data-lucide="star"></i>' : '<span class="rst-box"><i data-lucide="check"></i></span>'}<div><b>${esc(p.name)}</b><small>${esc(p.sub)}</small></div><i class="rst-chev" data-lucide="chevron-right"></i></button>`;
  }
  function renderPresets(inst, fresh) {
    inst.$('.rst-presets').innerHTML = `<div class="rst-panel-head"><i data-lucide="bookmark"></i><b>Saved Presets</b><button type="button" class="rst-link" data-act="manage">Manage</button></div>
      <div class="rst-preset-list">${inst.presets.map((p, i) => presetHTML(p, i, (i === 0 && fresh ? 'rst-new' : '') + (inst.activePreset === p ? ' on' : ''))).join('')}</div>
      <button type="button" class="rst-secondary" data-act="save"><i data-lucide="save"></i>Save Current Settings</button>`;
    icons(inst.$('.rst-presets'));
  }

  /* ---------------- data pipeline */
  const isNum = (c) => c.f.includes('n');
  const isSum = (c) => c.f.includes('n') && !c.f.includes('x');
  function visibleCols(inst, rep) {
    const o = inst.S.opts;
    const gk = !rep.stmt && o.group && inst.S.view === 'Detail' ? groupKey(inst, rep) : null;
    const cols = rep.cols.filter((c) => (o.value || !c.f.includes('v')) && (o.desc || !c.f.includes('d')) && c.k !== gk);
    return cols.length ? cols : rep.cols;
  }
  function isZero(r, rep) {
    if (r.z !== undefined) return r.z;
    if (r.t && r.t[0] !== 'r') return false;
    const nums = rep.cols.filter(isNum).map((c) => r[c.k]).filter((v) => typeof v === 'number');
    return nums.length > 0 && nums.every((v) => v === 0);
  }
  function groupKey(inst, rep) {
    const gf = inst.cfg.filters.find((f) => f.groupBy);
    if (gf) { const k = gf.groupBy[inst.S.af[gf.label]]; if (k && rep.rows.some((r) => k in r)) return k; }
    return rep.group;
  }
  function filteredRows(inst, rep) {
    const S = inst.S;
    let rows = rep.rows.filter((r) => S.opts.zero || !isZero(r, rep));
    inst.cfg.filters.forEach((f) => {
      const v = S.af[f.label];
      if (f.col && v !== f.options[0] && rep.rows.some((r) => f.col in r)) rows = rows.filter((r) => r.t ? r.t[0] !== 'r' || r[f.col] === v : r[f.col] === v);
      if (f.flag && v === 'on' && rep.rows.some((r) => f.flag in r)) rows = rows.filter((r) => r[f.flag]);
    });
    const q = (S.f[(inst.cfg.filters.find((f) => f.kind === 'search') || {}).label] || '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.t && r.t[0] !== 'r') || rep.cols.some((c) => String(r[c.k] == null ? '' : r[c.k]).toLowerCase().includes(q)) || String(r.d || '').toLowerCase().includes(q));
    if (!rep.stmt) {
      const sf = inst.cfg.filters.find((f) => f.kind === 'sort');
      const tgt = sf && (sf.options.find((o) => o[0] === S.af[sf.label]) || [])[1];
      if (tgt) {
        const col = tgt === '$text' ? rep.cols.find((c) => !isNum(c) && !c.f.includes('d') && /name|cust|vend|ratio|dept|acct|narr|part|m$/.test(c.k)) || rep.cols.find((c) => !isNum(c))
          : tgt === '$num' ? rep.cols.filter(isSum).slice(-1)[0] || rep.cols.filter(isNum).slice(-1)[0] : rep.cols.find((c) => c.k === tgt);
        if (col) {
          const dir = S.adir === 'Descending' ? -1 : 1;
          rows = rows.slice().sort((a, b) => { const x = a[col.k], y = b[col.k]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y))) * dir; });
        }
      }
    }
    if (rep.stmt) {
      /* drop section bands that lost all their lines */
      rows = rows.filter((r, i) => r.t !== 's' || rows.slice(i + 1).findIndex((x) => x.t === 's') !== 0);
    }
    return rows;
  }
  function groupsOf(rows, gk) {
    const m = new Map();
    rows.forEach((r) => { const g = r[gk] == null ? '—' : r[gk]; if (!m.has(g)) m.set(g, []); m.get(g).push(r); });
    return [...m.entries()];
  }

  /* ---------------- table rendering */
  function cellHTML(v, c) {
    const num = isNum(c);
    if (v == null || v === '') return `<td class="${num ? 'num' : ''}"></td>`;
    if (typeof v === 'number') {
      const dec = c.f.includes('2') ? 2 : v % 1 ? 2 : 0;
      if (v === 0) return '<td class="num zero">—</td>';
      if (v < 0) return `<td class="num neg">(${N(-v, dec)})</td>`;
      return `<td class="num">${N(v, dec)}</td>`;
    }
    return `<td class="${num ? 'num' : NOWRAP.test(c.k) ? 'nw' : ''}">${esc(v)}</td>`;
  }
  const NOWRAP = /^(sku|code|date|time|vch|inv|bill|no|uom|terms|last|rate|cover|stat)$/;
  function rowHTML(inst, r, cols, cls) {
    const dIdx = cols.findIndex((c) => !isNum(c) && !c.f.includes('d') && (c.k === 'name' || c.k === 'cust' || c.k === 'vend' || c.k === 'narr' || c.k === 'acct' || c.k === 'part' || c.k === 'ratio' || c.k === 'p'));
    return `<tr class="${cls || ''}">${cols.map((c, i) => {
      let h = cellHTML(r[c.k], c);
      if (i === (dIdx < 0 ? 0 : dIdx) && r.d && inst.S.opts.desc) h = h.replace(/<\/td>$/, `<small class="rst-d">${esc(r.d)}</small></td>`);
      return h;
    }).join('')}</tr>`;
  }
  function sumRow(label, rows, cols, cls, extra) {
    const lead = cols.findIndex(isNum);
    if (lead < 0) return `<tr class="${cls}"><td colspan="${cols.length}">${label}${extra || ''}</td></tr>`;
    return `<tr class="${cls}"><td colspan="${Math.max(1, lead)}">${label}${extra || ''}</td>${cols.slice(Math.max(1, lead)).map((c) => (isSum(c) ? cellHTML(sum(rows.map((r) => r[c.k])), c) : '<td class="num"></td>')).join('')}</tr>`;
  }
  function tableHTML(inst, rep, rows, opt) {
    opt = opt || {};
    const S = inst.S;
    const cols = visibleCols(inst, rep);
    const head = `<thead><tr>${cols.map((c) => `<th class="${isNum(c) ? 'num' : ''}">${esc(c.l)}</th>`).join('')}</tr></thead>`;
    let body = '';
    if (!rows.length) {
      body = `<tr class="rst-empty"><td colspan="${cols.length}">No rows match the current filters.</td></tr>`;
    } else if (rep.stmt) {
      const summary = S.view === 'Summary' && !opt.detail;
      body = rows.filter((r) => !(summary && r.t[0] === 'r') && !(summary && r.t === 'h') && !(!S.opts.group && r.t === 's')).map((r) => {
        if (r.t === 's') return `<tr class="rst-sec"><td colspan="${cols.length}">${esc(r[cols[0].k])}</td></tr>`;
        if (r.t === 'h') return `<tr class="rst-h"><td colspan="${cols.length}">${esc(r[cols[0].k])}</td></tr>`;
        const cls = r.t === 'u' ? 'rst-sub' : r.t === 't' ? 'rst-total' : r.t === 'r2' ? 'rst-row ind2' : 'rst-row';
        return rowHTML(inst, r, cols, cls);
      }).join('');
    } else {
      const gk = groupKey(inst, rep);
      const hasSum = cols.some(isSum);
      const groups = groupsOf(rows, gk);
      const unit = (n) => `<small class="rst-count">${n} ${n === 1 ? 'row' : 'rows'}</small>`;
      if (S.view === 'Summary' && !opt.detail) {
        body = groups.map(([g, rs]) => sumRow(esc(g), rs, cols, 'rst-gsum', unit(rs.length))).join('');
      } else if (S.opts.group && !opt.flat) {
        body = groups.map(([g, rs]) => `<tr class="rst-sec"><td colspan="${cols.length}">${esc(g)}${unit(rs.length)}</td></tr>` + rs.map((r) => rowHTML(inst, r, cols, 'rst-row')).join('') + (hasSum ? sumRow('Subtotal — ' + esc(g), rs, cols, 'rst-sub') : '')).join('');
      } else {
        body = rows.map((r) => rowHTML(inst, r, cols, 'rst-row')).join('');
      }
      if (hasSum && !opt.noTotal) body += sumRow(opt.totalLabel || 'Grand Total', rows, cols, 'rst-total');
    }
    return `<table class="rst-table${rep.stmt ? ' is-stmt' : ''}" data-plain>${head}<tbody>${body}</tbody></table>`;
  }

  /* ---------------- sheets */
  function pagesOf(inst) {
    const rep = tabOf(inst).report;
    const rows = filteredRows(inst, rep);
    let groups;
    if (rep.stmt) {
      groups = rows.filter((r) => r.t === 's').map((r) => [r[rep.cols[0].k], sectionRows(rows, r[rep.cols[0].k], rep)]);
    } else groups = groupsOf(rows, groupKey(inst, rep));
    return { rep, rows, groups, total: Math.max(1, Math.min(5, 1 + groups.length)) };
  }
  function sectionRows(rows, g, rep) {
    const i = rows.findIndex((r) => r.t === 's' && r[rep.cols[0].k] === g);
    if (i < 0) return [];
    const j = rows.findIndex((r, k) => k > i && r.t === 's');
    return rows.slice(i, j < 0 ? rows.length : j);
  }
  function criteriaOf(inst) {
    const S = inst.S, out = [['Report', tabOf(inst).label]];
    inst.cfg.filters.forEach((f) => {
      if (out.length >= 6) return;
      const v = S.af[f.label];
      if (f.kind === 'date') out.push([f.label, v + ' · ' + fmtDate(S.dates[f.label])]);
      else if (f.kind === 'select' || f.kind === 'radio') out.push([f.label, v]);
      else if (f.kind === 'sort') out.push(['Sorted By', v + ' (' + S.adir + ')']);
    });
    return out.slice(0, 6);
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]} ${MON[+m[2] - 1]} ${m[1]}` : iso || ''; };

  function statValue(v) {
    const m = /^(\(?)(Rs) (.*)$/.exec(v);
    return m ? `${m[1]}<small>${m[2]}</small> ${esc(m[3])}` : esc(v);
  }
  function sheetHTML(inst, pg, P) {
    const t = tabOf(inst), rep = t.report, c = inst.cfg;
    const sub = rep.subtitle ? `${t.label} · ${rep.subtitle}` : t.label;
    let body;
    if (pg === 1) {
      body = `
        <div class="rst-stats">${rep.stats.map((s) => `<div><span><i data-lucide="${s[0]}"></i></span><div><small>${esc(s[1])}</small><b>${statValue(s[2])}</b></div></div>`).join('')}</div>
        <div class="rst-table-wrap">${tableHTML(inst, rep, P.rows)}</div>
        <div class="rst-sheet-foot-grid">
          <div><h4>Summary</h4><table class="rst-kv" data-plain><tbody>${rep.summary.map((kv) => `<tr><td>${esc(kv[0])}</td><td>${statValue(kv[1])}</td></tr>`).join('')}</tbody></table></div>
          <div><h4>Report Criteria</h4><table class="rst-kv plain" data-plain><tbody>${criteriaOf(inst).map((kv) => `<tr><td>${esc(kv[0])}</td><td>${esc(kv[1])}</td></tr>`).join('')}</tbody></table></div>
        </div>`;
    } else {
      const g = P.groups[pg - 2];
      const rows = g ? g[1] : [];
      body = `<div class="rst-annex"><span>Annexure ${pg - 1}</span><b>${esc(rep.groupLabel || 'Group')}: ${esc(g ? g[0] : '—')}</b><small>${rows.length} ${rows.length === 1 ? 'line' : 'lines'} · continued from page 1</small></div>
        <div class="rst-table-wrap">${tableHTML(inst, rep, rows, { detail: true, flat: true, totalLabel: 'Total — ' + (g ? g[0] : '') })}</div>
        <div class="rst-annex-note"><i data-lucide="file-check"></i>Figures agree to the ${esc(rep.name)} on page 1. Prepared by Sana Javed, Finance Manager.</div>`;
    }
    return `<article class="rst-sheet" data-page="${pg}">
      <header class="rst-sheet-head">
        <div class="rst-co"><span class="rst-cube big"><i data-lucide="${c.moduleIcon}"></i></span><div><b>${esc(CO.name)}</b><small>${esc(CO.addr)}</small><small>${esc(CO.ntn)}</small></div></div>
        <div class="rst-sheet-title"><b>${esc(rep.name)}</b><span>${esc(sub)}</span><small>${esc(rep.period || '')}</small><small>Generated On: ${STAMP}</small><small>Page ${pg} of ${P.total}</small></div>
      </header>
      ${body}
      <footer class="rst-sheet-footer"><span>${esc(CO.name)}</span><span>${esc(rep.name)} - ${esc(t.label)}</span><span>Page ${pg} of ${P.total}</span></footer>
      <div class="rst-skel" aria-hidden="true"><i class="w40"></i><i class="w70"></i><i class="band"></i>${'<i class="row"></i>'.repeat(9)}<i class="w55"></i></div>
    </article>`;
  }

  function renderSheets(inst) {
    const S = inst.S;
    const P = pagesOf(inst);
    inst.P = P;
    if (S.page > P.total) S.page = P.total;
    let pages = [S.page];
    if (S.two && P.total > 1) pages = S.page < P.total ? [S.page, S.page + 1] : [S.page - 1, S.page];
    inst.zoomer.innerHTML = pages.map((p) => sheetHTML(inst, p, P)).join('');
    inst.zoomer.classList.toggle('two', pages.length > 1);
    icons(inst.zoomer);
    renderThumbs(inst);
    inst.$('.rst-pageno').textContent = `${S.page} / ${P.total}`;
    inst.$('[data-act="prev"]').disabled = S.page <= 1;
    inst.$('[data-act="next"]').disabled = S.page >= P.total;
    layout(inst);
  }
  function renderThumbs(inst) {
    const S = inst.S, P = inst.P;
    const on = S.two && P.total > 1 ? (S.page < P.total ? [S.page, S.page + 1] : [S.page - 1, S.page]) : [S.page];
    inst.$('.rst-thumbs').innerHTML = Array.from({ length: P.total }, (_, i) => i + 1).map((n) =>
      `<button type="button" role="option" data-pg="${n}" class="${on.includes(n) ? 'on' : ''}" aria-selected="${on.includes(n)}" aria-label="Page ${n}"><span class="rst-thumb"><i></i><i></i><i></i><i></i><i></i><i></i></span><small>${n}</small></button>`).join('');
  }

  /* ---------------- zoom & layout */
  function layout(inst) {
    const S = inst.S, stage = inst.stage;
    if (!stage.clientWidth) return;
    const cs = getComputedStyle(stage);
    const inner = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const W = Math.round(Math.max(560, Math.min(820, inner)));
    if (Math.abs(W - inst.W) > 1) { inst.W = W; inst.zoomer.style.setProperty('--rst-w', W + 'px'); }
    const natW = inst.zoomer.offsetWidth, natH = inst.zoomer.offsetHeight;
    if (S.fit) S.zoom = Math.max(S.two ? 30 : 50, Math.min(100, Math.floor((inner / natW) * 100)));
    const s = S.zoom / 100;
    inst.box.style.width = Math.round(natW * s) + 'px';
    inst.box.style.height = Math.round(natH * s) + 'px';
    inst.zoomer.style.transform = `scale(${s})`;
    inst.$('.rst-zoomval').textContent = S.zoom + '%';
    inst.$('[data-act="zoom-out"]').disabled = S.zoom <= (S.two ? 30 : 50);
    inst.$('[data-act="zoom-in"]').disabled = S.zoom >= 200;
  }

  /* ---------------- refresh with skeleton shimmer + crossfade */
  function refresh(inst, animate, done) {
    const stage = inst.stage;
    clearTimeout(inst.loadT);
    if (!animate) { renderSheets(inst); if (done) done(); return; }
    stage.classList.add('is-loading');
    inst.loadT = setTimeout(() => {
      renderSheets(inst);
      requestAnimationFrame(() => requestAnimationFrame(() => { stage.classList.remove('is-loading'); if (done) done(); }));
    }, later(350));
  }

  function renderAll(inst) {
    renderFilters(inst);
    renderOptions(inst);
    renderPresets(inst);
    syncTabs(inst);
    icons(inst.root);
    renderSheets(inst);
  }

  function syncTabs(inst) {
    const S = inst.S;
    inst.root.querySelectorAll('[data-tabkey]').forEach((b) => { const on = b.dataset.tabkey === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const sel = inst.$('[data-act-change="type"]');
    if (sel) sel.value = S.tab;
    moveInd(inst);
  }
  function moveInd(inst) {
    const b = inst.root.querySelector('[data-tabkey].active');
    const ind = inst.$('.rst-tab-ind');
    if (!b || !ind || !b.offsetWidth) return;
    ind.style.width = b.offsetWidth + 'px';
    ind.style.height = b.offsetHeight + 'px';
    ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  }

  function selectTab(inst, key, o) {
    o = o || {};
    const t = tabOf(inst, key);
    if (inst.S.tab === t.key && !o.force) return;
    inst.S.tab = t.key;
    inst.S.page = 1;
    syncTabs(inst);
    const b = inst.root.querySelector('[data-tabkey].active');
    if (b && b.scrollIntoView && o.nav !== false) { const tabs = b.parentElement; tabs.scrollTo({ left: b.offsetLeft - tabs.clientWidth / 2 + b.offsetWidth / 2, behavior: RM.matches ? 'auto' : 'smooth' }); }
    refresh(inst, o.animate !== false);
    if (o.nav !== false && t.route && inst.route !== t.route) {
      inst.navigating = true;
      inst.keepY = window.scrollY;
      inst.route = t.route;
      location.hash = '#/' + t.route;
    }
  }

  /* ---------------- actions */
  function busy(btn, ms, label, done) {
    if (!btn || btn.classList.contains('is-busy')) return;
    const lab = btn.querySelector('.rst-gen-label, span:last-child');
    const old = lab ? lab.textContent : '';
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    if (lab && label) lab.textContent = label;
    const fill = btn.querySelector('.rst-fill');
    if (fill) { fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = `width ${later(ms)}ms linear`; fill.style.width = '100%'; }
    setTimeout(() => {
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
      if (lab) lab.textContent = old;
      if (fill) { fill.style.transition = 'opacity .3s'; fill.style.opacity = '0'; setTimeout(() => { fill.style.transition = 'none'; fill.style.width = '0%'; fill.style.opacity = ''; }, 320); }
      done && done();
    }, later(ms));
  }
  function fileName(inst) {
    const rep = tabOf(inst).report, t = tabOf(inst);
    const base = rep.name === t.label ? rep.name : `${rep.name} - ${t.label}`;
    return base + (inst.S.fmt === 'Excel' ? '.xlsx' : '.pdf');
  }
  function generate(inst) {
    const btn = inst.$('.rst-generate');
    const tool = inst.$('[data-act="download"]');
    tool.classList.add('is-pulse');
    busy(btn, 1200, 'Generating…', () => {
      tool.classList.remove('is-pulse');
      if (inst.S.fmt === 'Print') { toast('Print preview ready · ' + tabOf(inst).label, { tone: 'good' }); doPrint(inst); return; }
      const name = fileName(inst);
      toast(`${inst.S.fmt} ready · ${name}`, { tone: 'good', action: { label: 'Download', fn() { download(inst, name); } } });
    });
  }
  function download(inst, name) {
    if (inst.S.fmt !== 'Excel') { doPrint(inst); return; }
    const rep = tabOf(inst).report, cols = visibleCols(inst, rep);
    const rows = filteredRows(inst, rep).filter((r) => !r.t || r.t !== 's');
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => q(c.l)).join(',')].concat(rows.map((r) => cols.map((c) => q(r[c.k])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name.replace(/\.xlsx$/, '.csv');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function doPrint(inst) {
    document.querySelectorAll('.rst-printing').forEach((e) => e.classList.remove('rst-printing'));
    inst.root.classList.add('rst-printing');
    document.documentElement.classList.add('rst-print-mode');
    const off = () => { inst.root.classList.remove('rst-printing'); document.documentElement.classList.remove('rst-print-mode'); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    try { window.print(); } catch (e) { /* ignore */ }
    setTimeout(off, 1500);
  }
  function toggleFull(inst) {
    const v = inst.$('.rst-viewer');
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
    if (v.requestFullscreen) v.requestFullscreen().catch(() => toast('Fullscreen is not available here', { tone: 'warn' }));
  }
  function onFullChange() {
    Object.values(INST).forEach((inst) => {
      const on = document.fullscreenElement === inst.$('.rst-viewer');
      const b = inst.$('[data-act="fullscreen"]');
      b.querySelector('.rst-fs-ico').innerHTML = `<i data-lucide="${on ? 'minimize' : 'maximize'}"></i>`;
      b.querySelector('small').textContent = on ? 'Exit' : 'Fullscreen';
      icons(b);
      setTimeout(() => layout(inst), 60);
    });
  }
  document.addEventListener('fullscreenchange', onFullChange);

  function applyFilters(inst) {
    const S = inst.S;
    S.af = Object.assign({}, S.f);
    S.adir = S.dir;
    S.page = 1;
    const btn = inst.$('.rst-apply');
    busy(btn, 420, 'Applying…');
    refresh(inst, true, () => {
      const n = filteredRows(inst, tabOf(inst).report).filter((r) => !r.t || r.t[0] === 'r').length;
      toast(`Report refreshed · ${n} ${n === 1 ? 'row' : 'rows'}`, { tone: 'good' });
    });
  }

  function snapshot(inst) {
    const S = inst.S;
    return { tab: S.tab, view: S.view, fmt: S.fmt, opts: Object.assign({}, S.opts), f: Object.assign({}, S.f), dir: S.dir };
  }
  function applyPreset(inst, p, btn) {
    const S = inst.S, set = p.set || {};
    const changed = new Set();
    if (set.view && set.view !== S.view) { S.view = set.view; changed.add('view'); }
    if (set.fmt && set.fmt !== S.fmt) { S.fmt = set.fmt; changed.add('fmt'); }
    Object.entries(set.opts || {}).forEach(([k, v]) => { if (S.opts[k] !== v) { S.opts[k] = v; changed.add(k); } });
    const fIdx = {};
    inst.cfg.filters.forEach((f, i) => { fIdx[f.label] = i; });
    /* reset non-preset filters to defaults so presets are deterministic */
    inst.cfg.filters.forEach((f, i) => { const want = (set.f && f.label in set.f) ? set.f[f.label] : (f.kind === 'search' ? S.f[f.label] : defF(f)); if (S.f[f.label] !== want) { S.f[f.label] = want; changed.add('f' + i); } });
    if (set.dir && set.dir !== S.dir) { S.dir = set.dir; }
    S.af = Object.assign({}, S.f);
    S.adir = S.dir;
    inst.activePreset = p;
    const tabChange = set.tab && set.tab !== S.tab;
    renderFilters(inst);
    renderOptions(inst);
    renderPresets(inst);
    icons(inst.$('.rst-filters'));
    icons(inst.$('.rst-options'));
    if (tabChange) changed.add('type');
    changed.forEach((k) => {
      const el = /^f\d+$/.test(k) ? inst.$(`[data-fld="${k.slice(1)}"]`) : inst.$(`[data-opt="${k}"]`);
      if (el) { el.classList.remove('rst-flash'); void el.offsetWidth; el.classList.add('rst-flash'); }
    });
    const row = inst.$(`[data-preset="${inst.presets.indexOf(p)}"]`);
    if (row) row.classList.add('rst-applied');
    if (tabChange) selectTab(inst, set.tab, { force: true });
    else { S.page = 1; refresh(inst, true); }
    toast(`Preset applied · ${p.name}`, { tone: 'info' });
  }
  function savePreset(inst) {
    const S = inst.S, t = tabOf(inst);
    const firstF = inst.cfg.filters.find((f) => (f.kind === 'select' || f.kind === 'radio') && S.f[f.label] !== defF(f));
    const n = inst.presets.filter((p) => p.custom).length + 1;
    const p = { name: `My ${t.label}${n > 1 ? ' ' + n : ''}`, sub: `${t.label} · ${firstF ? S.f[firstF.label] : S.view} · ${S.fmt}`, custom: true, set: snapshot(inst) };
    inst.presets.unshift(p);
    inst.activePreset = p;
    renderPresets(inst, true);
    toast(`Preset saved · ${p.name}`, { tone: 'good', undo() { inst.presets.splice(inst.presets.indexOf(p), 1); renderPresets(inst); } });
  }

  function setFilters(inst, open) {
    const S = inst.S;
    S.filters = open;
    inst.root.classList.toggle('no-filters', !open);
    if (open) setTimeout(() => { const f = inst.$('.rst-filters select, .rst-filters input'); f && f.focus({ preventScroll: true }); }, 280);
    else inst.$('[data-act="filters-open"]').focus({ preventScroll: true });
  }

  /* ---------------- wiring (event delegation) */
  function wire(inst) {
    const root = inst.root, S = inst.S;
    root.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tabkey]');
      if (tb) { selectTab(inst, tb.dataset.tabkey); return; }
      const th = e.target.closest('[data-pg]');
      if (th) { S.page = +th.dataset.pg; renderSheets(inst); flashSheet(inst); return; }
      const vw = e.target.closest('[data-view]');
      if (vw) { if (S.view !== vw.dataset.view) { S.view = vw.dataset.view; root.querySelectorAll('[data-view]').forEach((b) => { b.classList.toggle('on', b === vw); b.setAttribute('aria-pressed', b === vw); }); refresh(inst, true); } return; }
      const fm = e.target.closest('[data-fmt]');
      if (fm) { S.fmt = fm.dataset.fmt; root.querySelectorAll('[data-fmt]').forEach((b) => { b.classList.toggle('on', b === fm); b.setAttribute('aria-pressed', b === fm); }); return; }
      const pr = e.target.closest('[data-preset]');
      if (pr) { applyPreset(inst, inst.presets[+pr.dataset.preset], pr); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'prev' && S.page > 1) { S.page--; renderSheets(inst); flashSheet(inst); }
      if (act === 'next' && S.page < inst.P.total) { S.page++; renderSheets(inst); flashSheet(inst); }
      if (act === 'zoom-in') { S.fit = false; S.zoom = Math.min(200, Math.round(S.zoom / 10) * 10 + 10); layout(inst); }
      if (act === 'zoom-out') { S.fit = false; S.zoom = Math.max(Math.min(50, S.zoom), Math.ceil(S.zoom / 10) * 10 - 10); layout(inst); }
      if (act === 'fit') { S.fit = true; layout(inst); inst.stage.scrollTo({ left: 0, top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); }
      if (act === 'two') { S.two = !S.two; S.fit = true; a.classList.toggle('on', S.two); a.setAttribute('aria-pressed', S.two); refresh(inst, true); }
      if (act === 'download') generate(inst);
      if (act === 'print') doPrint(inst);
      if (act === 'fullscreen') toggleFull(inst);
      if (act === 'apply') applyFilters(inst);
      if (act === 'generate') generate(inst);
      if (act === 'save') savePreset(inst);
      if (act === 'filters-close') setFilters(inst, false);
      if (act === 'filters-open') setFilters(inst, true);
      if (act === 'manage') {
        const items = [
          { label: 'Reset to default presets', icon: 'history', onClick() { inst.presets = inst.cfg.presets.slice(); inst.activePreset = null; renderPresets(inst); toast('Presets reset'); } },
          { label: 'Clear my presets', icon: 'x', danger: true, onClick() { inst.presets = inst.presets.filter((p) => !p.custom); renderPresets(inst); toast('Custom presets cleared'); } },
        ];
        if (window.FS && FS.menu) FS.menu(a, items); else items[0].onClick();
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-act-change="type"]')) { selectTab(inst, t.value); return; }
      if (t.matches('[data-optk]')) {
        S.opts[t.dataset.optk] = t.checked;
        const bound = inst.cfg.filters.findIndex((f) => f.bind === t.dataset.optk);
        if (bound >= 0) { const sw = inst.$(`.rst-filters [data-f="${bound}"]`); if (sw) sw.checked = t.checked; }
        refresh(inst, true);
        return;
      }
      if (t.matches('[data-dir]')) { S.dir = t.value; return; }
      if (t.matches('[data-date]')) { S.dates[inst.cfg.filters[+t.dataset.date].label] = t.value; return; }
      if (t.matches('[data-f]')) {
        const f = inst.cfg.filters[+t.dataset.f];
        if (f.kind === 'toggle') {
          if (f.bind) { S.opts[f.bind] = t.checked; const ob = inst.$(`[data-optk="${f.bind}"]`); if (ob) ob.checked = t.checked; }
          S.f[f.label] = S.af[f.label] = t.checked ? 'on' : 'off';
          refresh(inst, true);
          return;
        }
        if (f.kind === 'radio') { t.closest('.rst-radios').querySelectorAll('label').forEach((l) => l.classList.toggle('on', l.contains(t))); }
        if (f.kind !== 'search') S.f[f.label] = t.value;
      }
    });
    let qT = 0;
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.matches('input[type="search"][data-f]')) return;
      const f = inst.cfg.filters[+t.dataset.f];
      S.f[f.label] = t.value;
      clearTimeout(qT);
      qT = setTimeout(() => { S.page = 1; refresh(inst, false); }, 140);
    });
    root.querySelector('.rst-tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = inst.cfg.tabs, i = tabs.findIndex((t) => t.key === S.tab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(inst, n.key);
      const b = root.querySelector(`[data-tabkey="${n.key}"]`);
      b && b.focus();
      e.preventDefault();
    });
    root.querySelector('.rst-grid').addEventListener('transitionend', (e) => { if (e.propertyName === 'grid-template-columns') layout(inst); });
    window.addEventListener('resize', () => moveInd(inst));
  }
  function flashSheet(inst) {
    const s = inst.zoomer.querySelector('.rst-sheet');
    if (!s || RM.matches) return;
    s.classList.remove('rst-turn'); void s.offsetWidth; s.classList.add('rst-turn');
  }

  /* ---------------- route hook */
  function enterStudio(sec, route) {
    const host = sec.querySelector('[data-studio]');
    if (!host) return;
    const key = host.dataset.studio;
    if (!STUDIOS[key]) return;
    const inst = INST[key] || mount(key);
    const nav = inst.navigating;
    if (inst.root.parentNode !== host) host.appendChild(inst.root);
    inst.route = route;
    const want = host.dataset.tab;
    if (want && inst.S.tab !== want && !nav) selectTab(inst, want, { nav: false, animate: false });
    inst.navigating = false;
    if (!nav && !RM.matches) { inst.root.classList.remove('rst-in'); void inst.root.offsetWidth; inst.root.classList.add('rst-in'); }
    if (nav && inst.keepY) { const y = inst.keepY; inst.keepY = 0; requestAnimationFrame(() => window.scrollTo(0, y)); }
    requestAnimationFrame(() => { moveInd(inst); layout(inst); });
  }

  /* ================================================================
     REPORTS CENTRE (app/reports) — static markup in 45-studios.html
     ================================================================ */
  function enterHub(sec) {
    const page = sec.querySelector('.rpc-page');
    if (page && !RM.matches) { page.classList.remove('rpc-in'); void page.offsetWidth; page.classList.add('rpc-in'); }
    if (sec.dataset.rpcWired) return;
    sec.dataset.rpcWired = '1';
    const input = sec.querySelector('.rpc-search input');
    const cards = [...sec.querySelectorAll('.rpc-card')];
    const empty = sec.querySelector('.rpc-noresult');
    let cat = 'all';
    const apply = () => {
      const q = (input.value || '').trim().toLowerCase();
      let shown = 0;
      cards.forEach((c) => {
        const ok = (cat === 'all' || c.dataset.cat === cat) && (!q || c.textContent.toLowerCase().includes(q));
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    };
    input.addEventListener('input', apply);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const c = cards.find((x) => !x.hidden); if (c) location.hash = c.getAttribute('href'); }
      if (e.key === 'Escape') { input.value = ''; apply(); input.blur(); }
    });
    sec.querySelectorAll('[data-rpc-cat]').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.rpcCat;
      sec.querySelectorAll('[data-rpc-cat]').forEach((x) => x.classList.toggle('active', x === b));
      apply();
    }));
  }
  /* Ctrl/Cmd+K focuses the hub search while the Reports Centre is the active screen */
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
    const hub = document.querySelector('.screen[data-route="app/reports"]');
    if (!hub || !hub.offsetParent) return;
    const inp = hub.querySelector('.rpc-search input');
    if (!inp) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    inp.focus();
    inp.select();
  }, true);

  /* ---------------- register */
  function register() {
    if (!window.FS || !FS.onEnter) return false;
    FS.onEnter((r) => !!document.querySelector(`.screen[data-route="${r}"] [data-studio]`), enterStudio);
    FS.onEnter('app/reports', enterHub);
    return true;
  }
  /* catch the initial route if the router already entered it before we registered */
  function kick() {
    const r = (location.hash || '').replace(/^#\/?/, '');
    const sec = r && document.querySelector(`.screen[data-route="${r}"]`);
    if (!sec || !sec.offsetParent) return;
    if (sec.querySelector('[data-studio]') && !sec.querySelector('.rst-page')) enterStudio(sec, r);
    if (r === 'app/reports') enterHub(sec, r, true);
  }
  if (register()) document.addEventListener('DOMContentLoaded', kick, { once: true });
  else document.addEventListener('DOMContentLoaded', () => { register(); setTimeout(kick, 0); }, { once: true });
})();
