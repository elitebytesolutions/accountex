/**
 * Finance, tax, company-settings and fixed-asset masters for the showcase company.
 *
 * State written: ctx.state.ids.company = {
 *   accounts: { [code]: id }                       chart of accounts (postable + groups), e.g. accounts['5220-01'] = Rent
 *   costCentres: [{ id, code, name, branchId }]    SAL/DST/WHS/ADM/FIN per branch (code like SAL-01 = HO, SAL-02 = KHI…)
 *   projects: [{ id, code, name }]
 *   bankAccounts: [{ id, title, accountId, branchId, purpose }]   accountId = the bank's GL account (cash/bank vouchers)
 *   cashAccounts: [{ id, name, accountId, branchId }]             main cash per branch
 *   chequeBooks: [{ id, bankAccountId, firstLeafNo, lastLeafNo }]
 *   pettyFunds: [{ id, name, branchId, cashAccountId, accountId }]
 *   expenseCategories: [{ id, code, name, accountId }]
 *   taxCodes: { gstSales, gstPurchase, furtherTax, whtGoods, whtServices, whtSalary, whtCustomer, adv236g }  (tax code ids)
 *   assetCategories: [{ id, code, name, costAccountId }]
 *   assets: [{ id, code, name, branchId, cost, acquisitionDate, voucherId }]  capitalised; acquisition paid by bank (BPV)
 * }
 */
import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { rngFor } from './rng.ts';

type Branch = { id: string; code: string; name: string };
const branchesOf = (ctx: Ctx): Branch[] => ctx.state.ids.branches;
/** Branch by code (HO, KHI, ISB); ids.branches is not in a fixed order beyond HO first. */
const br = (ctx: Ctx, code: 'HO' | 'KHI' | 'ISB'): Branch => {
  const b = branchesOf(ctx).find((x) => x.code === code);
  if (!b) throw new Error(`No branch ${code}`);
  return b;
};
const co = (ctx: Ctx) => (ctx.state.ids.company ??= {});
const items = (r: any): any[] => (Array.isArray(r) ? r : (r?.items ?? r?.rows ?? []));
const acc = (ctx: Ctx, code: string): string => {
  const id = co(ctx).accounts?.[code];
  if (!id) throw new Error(`No account ${code} in the chart`);
  return id;
};

/** Company profile, finance, tax and branding sections (Settings › Company). */
const settings: Step = {
  name: 'masters.company.settings',
  async run(ctx) {
    let s: any = await ctx.admin.get('/settings/company');
    s = await ctx.admin.put('/settings/company/profile', {
      legalName: 'Showcase Traders (Pvt) Ltd', tradingName: 'Showcase Traders', secpRegNo: '0187654',
      ntn: '4512398-6', strn: '32-77-8761-543-21', registeredAddress: '42 Main Boulevard, Gulberg III, Lahore',
      city: 'Lahore', province: 'PUNJAB', phone: '042-35761234', email: 'accounts@showcase.example.com',
      website: 'https://showcase.example.com', industry: 'TRADING_DISTRIBUTION', timezone: 'Asia/Karachi', legalStructure: 'PRIVATE_LIMITED',
      ...(s.saved ? { rowVersion: s.rowVersion } : {}),
    });
    s = await ctx.admin.get('/settings/company');
    s = await ctx.admin.put('/settings/company/finance', {
      fyStartMonth: 7, baseCurrencyCode: 'PKR', amountDecimals: 2, numberFormat: 'SOUTH_ASIAN', booksLockDate: null,
      fxRateSource: 'SBP_DAILY', allowMultiCurrency: false, requireCostCentreOnExpense: false, allowFuturePeriodPosting: false, rowVersion: s.rowVersion,
    });
    s = await ctx.admin.get('/settings/company');
    s = await ctx.admin.put('/settings/company/tax', {
      gstRegistered: true, salesTaxReturnPeriod: 'MONTHLY', standardGstRatePct: 18, furtherTaxRatePct: 4,
      provincialTaxAuthority: 'PRA', provincialServicesRatePct: 16, fbrRealtimeReporting: false, printFbrQr: false, rowVersion: s.rowVersion,
    });
    s = await ctx.admin.get('/settings/company');
    await ctx.admin.put('/settings/company/branding', {
      brandPrimaryColour: '#1D4ED8', brandAccentColour: '#F59E0B', documentFont: 'INTER', paperSize: 'A4',
      emailFooter: 'Showcase Traders (Pvt) Ltd · 42 Main Boulevard, Gulberg III, Lahore · 042-35761234', showPoweredBy: true, rowVersion: s.rowVersion,
    });
    const accounts: any[] = items(await ctx.admin.get('/accounting/accounts'));
    co(ctx).accounts = Object.fromEntries(accounts.map((a) => [a.code, a.id]));
    ctx.log(`  settings saved; ${accounts.length} accounts mapped`);
  },
};

/** Cost centres (one set per branch) and projects. */
const costCentres: Step = {
  name: 'masters.company.cost-centres',
  async run(ctx) {
    const existing = items(await ctx.admin.get('/accounting/cost-centres'));
    const kinds = [
      { p: 'SAL', name: 'Sales', budget: 6_000_000 }, { p: 'DST', name: 'Distribution', budget: 9_000_000 },
      { p: 'WHS', name: 'Warehouse', budget: 4_500_000 }, { p: 'ADM', name: 'Administration', budget: 3_000_000 },
      { p: 'FIN', name: 'Finance', budget: 2_000_000 },
    ];
    const want = branchesOf(ctx).flatMap((b, i) =>
      kinds.filter((k) => i === 0 || k.p !== 'FIN').map((k) => ({
        code: `${k.p}-${String(i + 1).padStart(2, '0')}`, name: `${k.name}: ${b.name}`, branchId: b.id, centreType: 'DEPARTMENT',
        annualBudget: i === 0 ? k.budget : Math.round(k.budget * 0.6), tags: [k.name.toLowerCase()],
      })));
    await pool(want.filter((w) => !existing.some((e) => e.code === w.code)), 6, (w) => ctx.admin.post('/accounting/cost-centres', w));
    const projects = items(await ctx.admin.get('/accounting/projects'));
    const wantProjects = [
      { code: 'PRJ-01', name: 'Karachi warehouse expansion', budgetAmount: 12_000_000, expectedRevenue: 0, startDate: '2025-08-01', endDate: '2026-03-31', colour: 'blue', status: 'COMPLETED', tags: ['capex'] },
      { code: 'PRJ-02', name: 'Ramadan trade campaign 2026', budgetAmount: 3_500_000, expectedRevenue: 25_000_000, startDate: '2026-02-01', endDate: '2026-04-15', colour: 'orange', status: 'COMPLETED', tags: ['marketing'] },
      { code: 'PRJ-03', name: 'Route automation rollout', budgetAmount: 2_000_000, expectedRevenue: 0, startDate: '2026-07-01', endDate: '2026-12-31', colour: 'violet', status: 'IN_PROGRESS', tags: ['it'] },
    ];
    await pool(wantProjects.filter((w) => !projects.some((e) => e.code === w.code)), 3, (w) => ctx.admin.post('/accounting/projects', w));
    co(ctx).costCentres = items(await ctx.admin.get('/accounting/cost-centres')).map((c) => ({ id: c.id, code: c.code, name: c.name, branchId: c.branchId }));
    co(ctx).projects = items(await ctx.admin.get('/accounting/projects')).map((p) => ({ id: p.id, code: p.code, name: p.name }));
    ctx.log(`  ${co(ctx).costCentres.length} cost centres, ${co(ctx).projects.length} projects`);
  },
};

/** Bank accounts (with their own GL accounts) and a cheque book each. */
const banks: Step = {
  name: 'masters.company.banks',
  async run(ctx) {
    const ho = br(ctx, 'HO'), khi = br(ctx, 'KHI');
    const bankList = items(await ctx.admin.get('/bank/banks?pageSize=100'));
    const bankId = (code: string) => {
      const b = bankList.find((x) => x.code === code);
      if (!b) throw new Error(`Bank ${code} not in the bank list`);
      return b.id;
    };
    const want = [
      { bankId: bankId('MEEZAN'), branchId: ho.id, accountTitle: 'Showcase Traders (Pvt) Ltd', accountNo: '0102-0105678901', iban: 'PK36MEZN0001020105678901', bankBranch: 'Gulberg Branch, Lahore', purpose: 'PRIMARY', statementFormat: 'BANK_CSV' },
      { bankId: bankId('HBL'), branchId: khi.id, accountTitle: 'Showcase Traders (Pvt) Ltd: Collections', accountNo: '1234-7900456703', iban: 'PK24HABB0012347900456703', bankBranch: 'I.I. Chundrigar Road, Karachi', purpose: 'COLLECTIONS', statementFormat: 'EXCEL' },
      { bankId: bankId('MCB'), branchId: ho.id, accountTitle: 'Showcase Traders (Pvt) Ltd: Payroll', accountNo: '0876-5432109876', iban: 'PK81MUCB0876543210987600', bankBranch: 'Main Market, Lahore', purpose: 'PAYROLL', statementFormat: 'BANK_CSV', useForPayroll: true },
    ];
    let accounts = items(await ctx.admin.get('/bank/accounts'));
    for (const w of want) {
      if (accounts.some((a) => a.accountNo === w.accountNo)) continue;
      await ctx.admin.post('/bank/accounts', { accountType: 'CURRENT', currencyCode: 'PKR', statementImportEnabled: true, ...w, gl: { mode: 'create', parentId: null } });
    }
    accounts = items(await ctx.admin.get('/bank/accounts'));
    const mine = accounts.filter((a) => want.some((w) => w.accountNo === a.accountNo));
    co(ctx).bankAccounts = await Promise.all(mine.map(async (a) => {
      const full: any = await ctx.admin.get(`/bank/accounts/${a.id}`);
      const w = want.find((x) => x.accountNo === a.accountNo)!;
      return { id: a.id, title: full.accountTitle ?? w.accountTitle, accountId: full.glAccount?.id ?? full.account?.id ?? full.accountId ?? full.gl?.id, branchId: w.branchId, purpose: w.purpose, bankCode: full.bank?.code ?? null };
    }));
    const books = items(await ctx.admin.get('/bank/cheque-books'));
    let leafBase = 10_000_001;
    for (const a of co(ctx).bankAccounts) {
      if (!books.some((b) => b.bankAccountId === a.id)) {
        await ctx.admin.post('/bank/cheque-books', { bankAccountId: a.id, bookRef: `CB-${a.title.slice(0, 3).toUpperCase()}-01`, firstLeafNo: leafBase, lastLeafNo: leafBase + 99, leafDigits: 8, crossedAcPayee: true, receivedOn: '2025-04-01', status: 'ACTIVE' });
      }
      leafBase += 1_000_000;
    }
    co(ctx).chequeBooks = items(await ctx.admin.get('/bank/cheque-books')).map((b) => ({ id: b.id, bankAccountId: b.bankAccountId, firstLeafNo: b.firstLeafNo, lastLeafNo: b.lastLeafNo }));
    if (co(ctx).bankAccounts.some((a: any) => !a.accountId)) throw new Error(`Bank account GL id missing: ${JSON.stringify(await ctx.admin.get(`/bank/accounts/${mine[0].id}`)).slice(0, 600)}`);
    ctx.log(`  ${co(ctx).bankAccounts.length} bank accounts, ${co(ctx).chequeBooks.length} cheque books`);
  },
};

/** Main cash per branch, petty-cash funds and expense categories. */
const cash: Step = {
  name: 'masters.company.cash',
  async run(ctx) {
    const custodians = items(await ctx.admin.get('/cash/petty-funds/custodians'));
    const admin = custodians.find((c) => c.name === 'Usman Tariq') ?? custodians[0];
    const approver = custodians.find((c) => c.name === 'Ayesha Malik') ?? custodians[0];
    let list = items(await ctx.admin.get('/cash/accounts'));
    for (const b of branchesOf(ctx)) {
      const name = `Main cash: ${b.name}`;
      if (list.some((a) => a.name === name)) continue;
      await ctx.admin.post('/cash/accounts', { name, shortName: `Cash ${b.code}`, kind: 'DRAWER', branchId: b.id, custodianUserId: admin.id, varianceTolerance: 1000, approvalThreshold: 100_000, gl: { mode: 'create', parentId: null } });
    }
    const funds = items(await ctx.admin.get('/cash/petty-funds'));
    const ho = br(ctx, 'HO'), khi = br(ctx, 'KHI');
    for (const f of [
      { name: 'Head office petty cash', branchId: ho.id, custodianUserId: approver.id, imprestAmount: 50_000 },
      { name: 'Karachi warehouse petty cash', branchId: khi.id, custodianUserId: admin.id, imprestAmount: 30_000 },
    ]) if (!funds.some((x) => x.name === f.name)) await ctx.admin.post('/cash/petty-funds', { ...f, lowPct: 25, criticalPct: 10, account: { mode: 'create' } });

    list = items(await ctx.admin.get('/cash/accounts'));
    const accountIdOf = (a: any) => a.glAccount?.id ?? a.account?.id ?? a.accountId ?? a.gl?.id;
    co(ctx).cashAccounts = list.filter((a) => a.name.startsWith('Main cash')).map((a) => ({ id: a.id, name: a.name, accountId: accountIdOf(a), branchId: a.branch?.id ?? a.branchId }));
    co(ctx).pettyFunds = items(await ctx.admin.get('/cash/petty-funds')).map((f) => ({ id: f.id, name: f.name, branchId: f.branch?.id ?? f.branchId, cashAccountId: f.cashAccount?.id ?? f.cashAccountId, accountId: f.account?.id ?? f.glAccount?.id ?? f.accountId ?? null }));
    if (co(ctx).cashAccounts.some((a: any) => !a.accountId)) throw new Error(`Cash account GL id missing: ${JSON.stringify(list[0]).slice(0, 600)}`);

    const cats = items(await ctx.admin.get('/cash/expense-categories'));
    const want = [
      { code: 'FUEL', name: 'Fuel & vehicle running', account: '5230-02', icon: 'fuel', limitAmount: 25_000, limitPeriod: 'PER_MONTH' },
      { code: 'UTILITIES', name: 'Utilities', account: '5220-02', icon: 'zap' },
      { code: 'RENT', name: 'Rent', account: '5220-01', icon: 'building', appliesTo: 'PETTY' },
      { code: 'TRAVEL', name: 'Travel & conveyance', account: '5240-03', icon: 'plane', limitAmount: 15_000, limitPeriod: 'PER_TRIP' },
      { code: 'MEALS', name: 'Meals & entertainment', account: '5240-04', icon: 'utensils', limitAmount: 2_500, limitPeriod: 'PER_MEAL' },
      { code: 'STATIONERY', name: 'Printing & stationery', account: '5240-02', icon: 'printer' },
      { code: 'REPAIRS', name: 'Repairs & maintenance', account: '5220-04', icon: 'wrench', requiresPreApproval: true },
      { code: 'COMMUNICATION', name: 'Mobile & internet', account: '5240-01', icon: 'phone', limitAmount: 5_000, limitPeriod: 'PER_MONTH' },
    ];
    await pool(want.filter((w) => !cats.some((c) => c.code === w.code)), 4, ({ account, ...w }, i) =>
      ctx.admin.post('/cash/expense-categories', { appliesTo: 'BOTH', receiptRequired: true, submitWithinDays: 30, sortOrder: (i + 1) * 10, ...w, accountId: acc(ctx, account) }));
    co(ctx).expenseCategories = items(await ctx.admin.get('/cash/expense-categories')).map((c) => ({ id: c.id, code: c.code, name: c.name, accountId: c.account?.id ?? c.accountId }));
    ctx.log(`  ${co(ctx).cashAccounts.length} cash accounts, ${co(ctx).pettyFunds.length} petty funds, ${co(ctx).expenseCategories.length} expense categories`);
  },
};

/** GST, further tax and the common withholding sections (only the missing ones are added). */
const taxCodes: Step = {
  name: 'masters.company.tax-codes',
  async run(ctx) {
    const rate = (r: number, nonAtl?: number) => [{ effectiveFrom: '2024-07-01', rate: r, nonAtlRate: nonAtl ?? null, financeAct: 'Finance Act 2024' }];
    const want: Record<string, any> = {
      gstSales: { code: 'GST-18', description: 'Sales tax 18% (standard rate)', taxType: 'SALES_TAX', appliesTo: 'SALES_AND_PURCHASES', salesTaxKind: 'STANDARD', accountId: acc(ctx, '2130-01'), inputAccountId: acc(ctx, '1150-01'), rates: rate(18) },
      gstExempt: { code: 'GST-EXEMPT', description: 'Exempt supplies (Sixth Schedule)', taxType: 'SALES_TAX', appliesTo: 'SALES_AND_PURCHASES', salesTaxKind: 'EXEMPT', rateBasis: 'NONE', rates: [] },
      furtherTax: { code: 'FT-4', description: 'Further tax 4% (unregistered buyers)', taxType: 'SALES_TAX', appliesTo: 'SALES', salesTaxKind: 'FURTHER', accountId: acc(ctx, '2130-02'), rates: rate(4) },
      whtGoods: { code: 'WHT-153A', description: 'WHT on supply of goods u/s 153(1)(a)', taxType: 'WITHHOLDING', appliesTo: 'VENDOR_PAYMENTS', whtSection: '153(1)(a)', whtNature: 'Supply of goods', accountId: acc(ctx, '2140-02'), checkAtl: true, rates: rate(5, 10) },
      whtServices: { code: 'WHT-153B', description: 'WHT on services u/s 153(1)(b)', taxType: 'WITHHOLDING', appliesTo: 'VENDOR_PAYMENTS', whtSection: '153(1)(b)', whtNature: 'Rendering of services', accountId: acc(ctx, '2140-02'), checkAtl: true, rates: rate(11, 22) },
      whtSalary: { code: 'WHT-149', description: 'Income tax on salaries u/s 149', taxType: 'WITHHOLDING', appliesTo: 'PAYROLL', whtSection: '149', whtNature: 'Salary', rateBasis: 'SLAB', accountId: acc(ctx, '2140-03'), rates: [{ effectiveFrom: '2024-07-01', financeAct: 'Finance Act 2024' }] },
      whtCustomer: { code: 'WHT-153A-CUST', description: 'WHT deducted by customers u/s 153(1)(a)', taxType: 'WITHHOLDING', appliesTo: 'CUSTOMER_RECEIPTS', whtSection: '153(1)(a)', whtNature: 'Tax deducted by customers', accountId: acc(ctx, '1150-03'), rates: rate(5, 10) },
      adv236g: { code: 'ADV-236G', description: 'Advance tax on sales to distributors u/s 236G', taxType: 'COLLECTION', appliesTo: 'SALES', whtSection: '236G', whtNature: 'Sales to distributors / wholesalers', accountId: acc(ctx, '2140-05'), checkAtl: true, rates: rate(0.5, 1) },
    };
    const existing = items(await ctx.admin.get('/tax/codes'));
    for (const w of Object.values(want)) {
      if (existing.some((e) => e.code === w.code)) continue;
      await soft(ctx, `tax code ${w.code}`, () => ctx.admin.post('/tax/codes', { rateBasis: 'PERCENT', calcOnExclSalesTax: true, ...w }));
    }
    const all = items(await ctx.admin.get('/tax/codes'));
    const id = (code: string) => all.find((c) => c.code === code)?.id ?? null;
    co(ctx).taxCodes = Object.fromEntries(Object.entries(want).map(([k, w]) => [k, id(w.code)]));
    co(ctx).taxCodes.gstPurchase = co(ctx).taxCodes.gstSales;
    ctx.log(`  tax codes: ${all.map((c) => c.code).join(', ')}`);
  },
};

/** Asset categories and ~15 assets bought Apr 2025 – Jun 2026, capitalised, each paid by a posted bank payment voucher. */
const assets: Step = {
  name: 'masters.company.assets',
  async run(ctx) {
    const rng = rngFor('company.assets');
    const cats = items(await ctx.admin.get('/assets/categories'));
    const wantCats = [
      { code: 'VEH', name: 'Vehicles', defaultMethod: 'WDV', defaultRatePct: 15, costAccountId: acc(ctx, '1210-07'), tagPrefix: 'VEH-' },
      { code: 'IT', name: 'Computers & IT equipment', defaultMethod: 'SLM', defaultRatePct: 30, costAccountId: acc(ctx, '1210-06'), tagPrefix: 'IT-' },
      { code: 'FUR', name: 'Furniture & fixtures', defaultMethod: 'WDV', defaultRatePct: 10, costAccountId: acc(ctx, '1210-04'), tagPrefix: 'FUR-' },
      { code: 'WHE', name: 'Warehouse equipment', defaultMethod: 'WDV', defaultRatePct: 15, costAccountId: acc(ctx, '1210-03'), tagPrefix: 'WHE-' },
    ].map((c) => ({ ...c, accumDepAccountId: acc(ctx, '1220-01'), depExpenseAccountId: acc(ctx, '5250-01') }));
    for (const c of wantCats) if (!cats.some((x) => x.code === c.code)) await ctx.admin.post('/assets/categories', c);
    const catList = items(await ctx.admin.get('/assets/categories'));
    co(ctx).assetCategories = catList.map((c) => ({ id: c.id, code: c.code, name: c.name, costAccountId: c.costAccount?.id ?? c.costAccountId }));
    const cat = (code: string) => catList.find((c) => c.code === code)!;

    const ho = br(ctx, 'HO'), khi = br(ctx, 'KHI'), isb = br(ctx, 'ISB');
    const plan = [
      { name: 'Suzuki Ravi delivery van', c: 'VEH', b: ho, cost: 2_850_000, date: '2025-04-10', reg: 'LEB-25-4471' },
      { name: 'Suzuki Ravi delivery van', c: 'VEH', b: khi, cost: 2_850_000, date: '2025-04-18', reg: 'KHI-25-9012' },
      { name: 'Hyundai Shehzore truck', c: 'VEH', b: ho, cost: 6_400_000, date: '2025-07-05', reg: 'LES-25-1188' },
      { name: 'Toyota Corolla (sales manager)', c: 'VEH', b: isb, cost: 7_200_000, date: '2025-10-02', reg: 'ICT-25-777' },
      { name: 'Electric forklift 2.5 ton', c: 'WHE', b: ho, cost: 3_900_000, date: '2025-05-14' },
      { name: 'Electric forklift 2.5 ton', c: 'WHE', b: khi, cost: 3_900_000, date: '2025-11-20' },
      { name: 'Racking system (warehouse A)', c: 'WHE', b: ho, cost: 1_750_000, date: '2025-06-03' },
      { name: 'Cold room unit', c: 'WHE', b: khi, cost: 2_400_000, date: '2026-01-12' },
      { name: 'Dell Latitude laptops (10)', c: 'IT', b: ho, cost: 2_350_000, date: '2025-04-22' },
      { name: 'HP ProDesk workstations (6)', c: 'IT', b: khi, cost: 1_080_000, date: '2025-08-19' },
      { name: 'Server and network rack', c: 'IT', b: ho, cost: 1_650_000, date: '2025-09-09' },
      { name: 'Handheld order-taking devices (25)', c: 'IT', b: isb, cost: 1_125_000, date: '2026-03-02' },
      { name: 'Office furniture: head office', c: 'FUR', b: ho, cost: 1_400_000, date: '2025-04-28' },
      { name: 'Office furniture: Karachi', c: 'FUR', b: khi, cost: 780_000, date: '2025-09-25' },
      { name: 'Office furniture: Islamabad', c: 'FUR', b: isb, cost: 650_000, date: '2026-06-08' },
    ];
    const centres: any[] = co(ctx).costCentres ?? [];
    const bank = (co(ctx).bankAccounts as any[]).find((a) => a.purpose === 'PRIMARY');
    const existing = items(await ctx.admin.get('/assets?pageSize=100'));
    const out: any[] = (co(ctx).assets ?? []).filter((a: any) => existing.some((e) => e.id === a.id));
    for (const [i, p] of plan.entries()) {
      const label = `${p.name} #${i + 1}`;
      let a = existing.find((e) => e.name === label);
      const c = cat(p.c);
      if (!a) {
        a = await ctx.admin.post('/assets', {
          name: label, categoryId: c.id, branchId: p.b.id,
          costCentreId: centres.find((x) => x.branchId === p.b.id && x.code.startsWith(p.c === 'VEH' ? 'DST' : p.c === 'WHE' ? 'WHS' : 'ADM'))?.id ?? null,
          serialNo: `SN-${rng.int(100000, 999999)}`, acquisitionDate: p.date, cost: p.cost, method: c.defaultMethod, ratePct: c.defaultRatePct,
          residualValue: Math.round(p.cost * 0.05), chargeFullMonthOnPurchase: true,
          costAccountId: c.costAccount?.id ?? c.costAccountId, accumDepAccountId: acc(ctx, '1220-01'), depExpenseAccountId: acc(ctx, '5250-01'),
          ...(p.reg ? { registrationNo: p.reg, engineNo: `EN${rng.int(1000000, 9999999)}`, chassisNo: `CH${rng.int(10000000, 99999999)}`, insurer: 'EFU General Insurance', insurancePolicyNo: `EFU-${rng.int(100000, 999999)}`, insuranceExpiry: '2026-12-31' } : {}),
        });
      }
      if (a.status === 'NEW') a = await ctx.admin.post(`/assets/${a.id}/capitalise`, { rowVersion: a.rowVersion, billLineId: null });
      let rec = out.find((o) => o.id === a.id);
      if (!rec) { rec = { id: a.id, code: a.code, name: a.name, branchId: p.b.id, cost: p.cost, acquisitionDate: p.date, voucherId: null }; out.push(rec); }
      rec.branchId = p.b.id;
      if (!rec.voucherId) {
        // Purchase paid from the main bank account: Dr asset cost / Cr bank (auto contra), posted on the acquisition date.
        const v: any = await ctx.admin.post('/accounting/vouchers', {
          voucherType: 'BPV', docDate: p.date, postingDate: p.date, branchId: p.b.id, referenceNo: a.code,
          narration: `Purchase of ${p.name}`, cashBankAccountId: bank.accountId, partyName: p.c === 'VEH' ? 'Pak Suzuki Motor Co.' : p.c === 'IT' ? 'Mega Computers (Pvt) Ltd' : 'Interwood Mobel (Pvt) Ltd',
          instrumentType: 'CHEQUE', instrumentNo: String(10_000_001 + i), instrumentDate: p.date, tags: ['capex'],
          lines: [{ accountId: c.costAccount?.id ?? c.costAccountId, particulars: label, debit: p.cost, credit: 0 }],
        });
        await ctx.admin.post(`/accounting/vouchers/${v.id}/post`, { rowVersion: v.rowVersion });
        rec.voucherId = v.id;
      }
      co(ctx).assets = out;
      ctx.save();
    }
    ctx.log(`  ${co(ctx).assetCategories.length} asset categories, ${out.length} assets capitalised and paid`);
  },
};

/**
 * One-off repair for the first run, which read ids.branches as [HO, KHI, ISB] while it is [HO, ISB, KHI]: moves the
 * Karachi bank account and petty fund to Karachi, and transfers the assets that landed in the wrong branch (approved by
 * the approver). A no-op when everything is already where it belongs.
 */
const branchFix: Step = {
  name: 'masters.company.branch-fix',
  async run(ctx) {
    const khi = br(ctx, 'KHI');
    for (const a of items(await ctx.admin.get('/bank/accounts'))) {
      if (a.accountNo !== '1234-7900456703') continue;
      const full: any = await ctx.admin.get(`/bank/accounts/${a.id}`);
      if ((full.branch?.id ?? full.branchId) !== khi.id) { await ctx.admin.patch(`/bank/accounts/${a.id}`, { branchId: khi.id, rowVersion: full.rowVersion }); ctx.log('  moved HBL collections account to Karachi'); }
    }
    for (const f of items(await ctx.admin.get('/cash/petty-funds'))) {
      if (f.name !== 'Karachi warehouse petty cash' || (f.branch?.id ?? f.branchId) === khi.id) continue;
      await ctx.admin.patch(`/cash/petty-funds/${f.id}`, { branchId: khi.id, rowVersion: f.rowVersion });
      const cashId = f.cashAccount?.id ?? f.cashAccountId;
      const ca = items(await ctx.admin.get('/cash/accounts')).find((x) => x.id === cashId);
      if (ca && (ca.branch?.id ?? ca.branchId) !== khi.id) await soft(ctx, 'petty cash account branch', () => ctx.admin.patch(`/cash/accounts/${ca.id}`, { branchId: khi.id, rowVersion: ca.rowVersion }));
      ctx.log('  moved Karachi petty fund to Karachi');
    }
    // Intended branch per asset number (see the assets step's plan).
    const intended: Record<number, 'HO' | 'KHI' | 'ISB'> = { 2: 'KHI', 4: 'ISB', 6: 'KHI', 8: 'KHI', 10: 'KHI', 12: 'ISB', 14: 'KHI', 15: 'ISB' };
    const list = items(await ctx.admin.get('/assets?pageSize=100'));
    for (const [n, code] of Object.entries(intended)) {
      const a = list.find((x) => x.name.endsWith(` #${n}`));
      const target = br(ctx, code);
      if (!a || (a.branch?.id ?? a.branchId) === target.id) continue;
      const rec = (co(ctx).assets as any[]).find((x) => x.id === a.id);
      const t: any = await ctx.admin.post(`/assets/${a.id}/transfer`, { toBranchId: target.id, effectiveDate: addDaysIso(a.acquisitionDate, 5), reason: `Delivered to the ${target.name} branch after purchase` });
      const transferId = t.id ?? t.transfers?.find((x: any) => x.status !== 'COMPLETED')?.id ?? t.transfers?.[0]?.id;
      await ctx.approver.post(`/assets/transfers/${transferId}/approve`, {});
      if (rec) rec.branchId = target.id;
      ctx.log(`  transferred ${a.code} to ${target.code}`);
    }
  },
};
const addDaysIso = (d: string, n: number) => { const x = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const withSave = (s: Step): Step => ({ name: s.name, run: async (ctx) => { await s.run(ctx); ctx.save(); } });

export const steps: Step[] = [settings, costCentres, banks, cash, taxCodes, assets, branchFix].map(withSave);
