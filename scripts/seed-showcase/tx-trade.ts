/**
 * Trade transactions for the showcase company, Apr 2025 → today, all through the API so posting writes the GL vouchers
 * and the stock ledger: route users, opening stock, then one step per month (purchases → sales → returns / credit notes
 * → receipts → vendor payments → service bills → stock housekeeping). Later months buy against the month's planned sales,
 * so stock never goes negative; the month's plan is kept in the state file, so a failed month resumes without duplicates.
 *
 * State: ids.tradeTx = {
 *   users: { [employeeId]: userId }            route staff given a login (salesmen, bookers, deliverymen)
 *   plans: { [month]: MonthPlan }              plan of a month in progress (dropped when the month finishes)
 *   done:  { [key]: id }                       documents finished in a month in progress (plan keys)
 *   chequeNo: number                           next cheque leaf used for vendor cheques
 *   counts: { invoices, orders, quotations, challans, receipts, bills, pos, grns, payments, returns, creditNotes,
 *             purchaseReturns, debitNotes, adjustments, stockOuts, stockCounts, transfers }
 * }
 */
import type { Api } from './client.ts';
import { pool, soft, type Ctx, type Step } from './ctx.ts';
import { addDays, months, monthEnd, rngFor, today, workDays, Rng } from './rng.ts';
import { steps as tradeMasterSteps } from './masters-trade.ts';
import { adminSessions, closeDb, expiringStock, openBills, openInvoices, q, r2, rr, stockOnHand } from './tx-trade-lib.ts';

type Prod = { id: string; sku: string; name: string; perCarton: number; cost: number; price: number; wprice: number; batchTracked: boolean; vendorId: string; classId: string };
type Cust = { id: string; code: string; name: string; branchId: string; branch: string; groupId: string; group: string; creditDays: number };
type Line = { p: string; ctn: number; loose: number };
type SaleSpec = { key: string; date: string; c: string; flow: 'Q' | 'SO' | 'DIRECT'; stop?: 'ORDER' | 'CHALLAN'; lines: Line[] };
type PoSpec = { key: string; date: string; grnDate: string; wh: string; v: string; lines: { p: string; ctn: number }[] };
type MonthPlan = { po: PoSpec[]; sales: SaleSpec[]; quotesLost: SaleSpec[] };

const TID = (ctx: Ctx) => ctx.tenantId;
const tt = (ctx: Ctx) => (ctx.state.ids.tradeTx ??= { users: {}, plans: {}, done: {}, chequeNo: 10000101, counts: {} });
const bump = (ctx: Ctx, k: string, n = 1) => { const c = tt(ctx).counts; c[k] = (c[k] ?? 0) + n; };
const br = (ctx: Ctx, code: string) => (ctx.state.ids.branches as any[]).find((b) => b.code === code)!;
const T = (ctx: Ctx) => ctx.state.ids.trade;
const prods = (ctx: Ctx): Prod[] => T(ctx).products;
const custs = (ctx: Ctx): Cust[] => T(ctx).customers;
const mainWh = (ctx: Ctx): { id: string; code: string; branchId: string }[] => T(ctx).warehouses.filter((w: any) => w.main);
const whOfBranch = (ctx: Ctx, branchId: string) => mainWh(ctx).find((w) => w.branchId === branchId)!;
const branchCodeOf = (ctx: Ctx, branchId: string) => (ctx.state.ids.branches as any[]).find((b) => b.id === branchId)!.code as string;
/** Posts with a retry: concurrent issues of the same expiry-tracked item can both read one batch (STOCK_INSUFFICIENT, rolled back). */
async function postRetry(api: Api, path: string, body: unknown): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try { return await api.post(path, body); } catch (e: any) {
      if (e?.code !== 'STOCK_INSUFFICIENT' || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}
const items = (r: any): any[] => (Array.isArray(r) ? r : (r?.items ?? []));
const capDate = (d: string) => (d > today() ? today() : d);
/** Deterministic 0–1 value per id (pay timing of an invoice / bill). */
const h01 = (s: string) => new Rng([...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261)).next();

// ---------------------------------------------------------------------------------------------------- options
let optCache: { sales: any; recv: any; purch: any; ops: any } | null = null;
async function opts(ctx: Ctx) {
  if (!optCache) {
    const [sales, recv, purch, ops] = await Promise.all([
      ctx.admin.get('/sales/doc-options'), ctx.admin.get('/sales/receivables-options'), ctx.admin.get('/purchases/options'), ctx.admin.get('/inventory/ops/options')]);
    optCache = { sales, recv, purch, ops };
  }
  return optCache;
}
const gst = async (ctx: Ctx) => (await opts(ctx)).sales.taxCodes.find((t: any) => t.code === 'GST-18').id as string;
const reason = async (ctx: Ctx, code: string) => (await opts(ctx)).ops.reasons.find((r: any) => r.code === code).id as string;

// ---------------------------------------------------------------------------------------------------- demand model
/** Popularity weight of a product (stable). */
const weight = (p: Prod) => 0.35 + 1.8 * h01(`w:${p.sku}`);
/** Seasonality: Ramadan (Feb–Mar 2026) lifts everything; summer lifts beverages and dairy drinks. */
function season(month: string, p?: Prod, ctx?: Ctx): number {
  const mm = Number(month.slice(5, 7));
  let f = month === '2026-03-01' ? 1.25 : month === '2026-02-01' ? 1.1 : 1;
  if (p && ctx && mm >= 5 && mm <= 8) {
    const cls = T(ctx).classes.find((c: any) => c.id === p.classId)?.name ?? '';
    if (cls === 'Beverages') f *= 1.6; else if (cls === 'Dairy' || cls === 'Frozen Foods') f *= 1.15;
  }
  return f;
}
/** Invoices in a month: grows ~1.5% a month, Ramadan peak, the current month pro-rated to today. */
function invoiceCount(month: string, i: number): number {
  const base = (84 + i * 1.8) * (month === '2026-03-01' ? 1.22 : month === '2026-02-01' ? 1.08 : 1);
  let all = 0;
  for (let d = month; d <= monthEnd(month); d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) all++;
  return Math.max(1, Math.round(base * (workDays(month).length / all)));
}

/** Sales plan of a month (desired quantities, before the stock cap). */
function salesPlan(ctx: Ctx, month: string, i: number, pid = month.slice(0, 7)): { sales: SaleSpec[]; quotesLost: SaleSpec[] } {
  const rng = rngFor(`trade.sales.${pid === month.slice(0, 7) ? month : pid}`);
  const days = workDays(month);
  const cs = custs(ctx);
  const ps = prods(ctx);
  const wCust = (c: Cust) => ({ RETAIL: 1, WHOLESALE: 1.6, SUPERSTORE: 2.2, INSTITUTIONAL: 0.8 } as Record<string, number>)[c.group] ?? 1;
  const totalW = cs.reduce((s, c) => s + wCust(c), 0);
  const pickCust = () => { let x = rng.next() * totalW; for (const c of cs) { x -= wCust(c); if (x <= 0) return c; } return cs[cs.length - 1]; };
  const pw = ps.map((p) => weight(p) * season(month, p, ctx));
  const pwTotal = pw.reduce((a, b) => a + b, 0);
  const pickProd = () => { let x = rng.next() * pwTotal; for (let k = 0; k < ps.length; k++) { x -= pw[k]; if (x <= 0) return ps[k]; } return ps[ps.length - 1]; };
  const linesFor = (c: Cust): Line[] => {
    const [lo, hi] = ({ RETAIL: [4, 8], WHOLESALE: [6, 12], SUPERSTORE: [8, 14], INSTITUTIONAL: [4, 8] } as Record<string, [number, number]>)[c.group] ?? [4, 8];
    const n = rng.int(lo, hi);
    const seen = new Set<string>();
    const out: Line[] = [];
    for (let k = 0; k < n * 2 && out.length < n; k++) {
      const p = pickProd();
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (c.group === 'RETAIL' && rng.chance(0.3)) out.push({ p: p.id, ctn: 0, loose: Math.max(1, Math.round(p.perCarton * (0.4 + rng.next() * 0.6))) });
      else {
        const [a, b] = ({ RETAIL: [1, 3], WHOLESALE: [8, 24], SUPERSTORE: [6, 18], INSTITUTIONAL: [2, 6] } as Record<string, [number, number]>)[c.group] ?? [1, 3];
        out.push({ p: p.id, ctn: rng.int(a, b), loose: 0 });
      }
    }
    return out;
  };
  const n = invoiceCount(month, i);
  const sales: SaleSpec[] = [];
  const isCurrent = monthEnd(month) >= today();
  for (let k = 0; k < n; k++) {
    const c = pickCust();
    const date = days[Math.min(days.length - 1, Math.floor((k / n) * days.length))];
    const roll = rng.next();
    const flow: SaleSpec['flow'] = c.group === 'RETAIL' ? (roll < 0.12 ? 'SO' : 'DIRECT') : roll < 0.3 ? 'Q' : roll < 0.6 ? 'SO' : 'DIRECT';
    const spec: SaleSpec = { key: `${pid}-S${String(k + 1).padStart(3, '0')}`, date, c: c.id, flow, lines: linesFor(c) };
    // The pipeline of the current month: the last week's order flows stop at the order or challan stage.
    if (isCurrent && flow !== 'DIRECT' && date >= addDays(today(), -6)) spec.stop = rng.chance(0.5) ? 'ORDER' : 'CHALLAN';
    sales.push(spec);
  }
  const quotesLost: SaleSpec[] = [];
  for (let k = 0; k < 3; k++) {
    const c = cs.filter((x) => x.group !== 'RETAIL')[rng.int(0, cs.filter((x) => x.group !== 'RETAIL').length - 1)];
    quotesLost.push({ key: `${pid}-QL${k + 1}`, date: days[rng.int(0, days.length - 1)], c: c.id, flow: 'Q', lines: linesFor(c) });
  }
  return { sales, quotesLost };
}

/** Units a sale line asks for. */
const units = (ctx: Ctx, l: Line) => { const p = prods(ctx).find((x) => x.id === l.p)!; return l.ctn * p.perCarton + l.loose; };

/** Purchase plan: per main warehouse × principal, cover the month's demand plus ~3 weeks of safety stock. */
function purchasePlan(ctx: Ctx, month: string, sales: SaleSpec[], onHand: Map<string, number>, pid = month.slice(0, 7)): PoSpec[] {
  const rng = rngFor(`trade.po.${pid === month.slice(0, 7) ? month : pid}`);
  const days = workDays(month);
  const demand = new Map<string, number>();
  for (const s of sales) {
    const c = custs(ctx).find((x) => x.id === s.c)!;
    const wh = whOfBranch(ctx, c.branchId).id;
    for (const l of s.lines) demand.set(`${wh}|${l.p}`, (demand.get(`${wh}|${l.p}`) ?? 0) + units(ctx, l));
  }
  const out: PoSpec[] = [];
  const principals = T(ctx).vendors.filter((v: any) => v.kind === 'PRINCIPAL');
  let n = 0;
  for (const wh of mainWh(ctx)) for (const v of principals) {
    const lines: PoSpec['lines'] = [];
    for (const p of prods(ctx).filter((x) => x.vendorId === v.id)) {
      const d = demand.get(`${wh.id}|${p.id}`) ?? 0;
      const need = d * 1.75 - (onHand.get(`${wh.id}|${p.id}`) ?? 0);
      if (need > p.perCarton * 0.5) lines.push({ p: p.id, ctn: Math.ceil(need / p.perCarton) });
    }
    if (!lines.length) continue;
    const date = days[Math.min(days.length - 1, rng.int(0, 1))];
    const grnDate = days[Math.min(days.length - 1, days.indexOf(date) + rng.int(1, 2))];
    out.push({ key: `${pid}-P${String(++n).padStart(2, '0')}`, date, grnDate, wh: wh.id, v: v.id, lines });
  }
  return out;
}

/** Caps each sale line at the stock that is there on its date (start-of-month stock + receipts up to that date). */
function capSales(ctx: Ctx, sales: SaleSpec[], po: PoSpec[], onHand: Map<string, number>): SaleSpec[] {
  const sim = new Map(onHand);
  const arrivals = po.flatMap((x) => x.lines.map((l) => ({ date: x.grnDate, k: `${x.wh}|${l.p}`, qty: l.ctn * prods(ctx).find((p) => p.id === l.p)!.perCarton })))
    .sort((a, b) => a.date.localeCompare(b.date));
  let ai = 0;
  const out: SaleSpec[] = [];
  for (const s of [...sales].sort((a, b) => a.date.localeCompare(b.date))) {
    // Receipts of the day are posted before the day's sales.
    while (ai < arrivals.length && arrivals[ai].date <= s.date) { const a = arrivals[ai++]; sim.set(a.k, (sim.get(a.k) ?? 0) + a.qty); }
    const wh = whOfBranch(ctx, custs(ctx).find((c) => c.id === s.c)!.branchId).id;
    const lines: Line[] = [];
    for (const l of s.lines) {
      const k = `${wh}|${l.p}`;
      const have = sim.get(k) ?? 0;
      const want = units(ctx, l);
      if (have >= want) { lines.push(l); sim.set(k, have - want); continue; }
      const p = prods(ctx).find((x) => x.id === l.p)!;
      const ctn = Math.floor(have / p.perCarton);
      if (l.ctn > 0 && ctn > 0) { lines.push({ ...l, ctn }); sim.set(k, have - ctn * p.perCarton); }
      else if (l.loose > 0 && have >= 1) { const take = Math.min(l.loose, Math.floor(have)); lines.push({ ...l, loose: take }); sim.set(k, have - take); }
    }
    if (lines.length) out.push({ ...s, lines });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- 0. route users
const routeUsers: Step = {
  name: 'tx.trade.route-users',
  async run(ctx) {
    const emps: any[] = ctx.state.ids.people.employees.filter((e: any) => e.isSalesman || e.isBooker || e.isDeliveryman);
    const roles: any[] = await ctx.admin.all('/settings/roles');
    const role = (k: string) => roles.find((r) => r.systemKey === k)?.id;
    const users: any[] = await ctx.admin.all('/settings/users');
    for (const e of emps) {
      const [first, ...rest] = String(e.name).toLowerCase().split(' ');
      const email = `${first}.${rest.join('')}@showcase.accountex.local`;
      let u = users.find((x) => x.email === email);
      if (!u) {
        const roleIds = [e.isSalesman && role('SALESMAN'), e.isBooker && role('ORDER_BOOKER'), e.isDeliveryman && role('DELIVERYMAN')].filter(Boolean);
        u = await ctx.admin.post('/settings/users', {
          fullName: e.name, email, jobTitle: e.designation, department: 'Sales', roleIds, branchIds: [e.branchId],
          temporaryPassword: process.env.SHOWCASE_USER_PASSWORD, mustChangePassword: false,
        });
        ctx.log(`  user ${email}`);
      }
      const emp: any = await ctx.admin.get(`/hr/employees/${e.id}`);
      const linked = emp.appUserId ?? emp.userId ?? emp.user?.id ?? null;
      if (linked !== u.id) await ctx.admin.post(`/hr/employees/${e.id}/link-user`, { userId: u.id, rowVersion: emp.rowVersion });
      tt(ctx).users[e.id] = u.id;
      e.userId = u.id;
    }
    ctx.save();
    // Give the routes their real salesmen, bookers and drivers (the distribution step fills seats held by EMP-0001).
    const dist = tradeMasterSteps.find((s) => s.name === 'masters.trade.distribution')!;
    await dist.run(ctx);
    // Seats from the route's own branch (the distribution step fills them in list order).
    const staff = ctx.state.ids.people.employees as any[];
    const ofBranch = (branchId: string, flag: string) => staff.filter((e) => e.branchId === branchId && e[flag]);
    const routes = items(await ctx.admin.get('/distribution/routes'));
    for (const r of routes) {
      const branchId = r.branch?.id ?? r.branchId;
      const nth = routes.filter((x: any) => (x.branch?.id ?? x.branchId) === branchId).findIndex((x: any) => x.id === r.id);
      const seat = (flag: string, fallback: string | null) => { const l = ofBranch(branchId, flag); return l.length ? l[nth % l.length].id : fallback; };
      const want = {
        salesmanEmployeeId: seat('isSalesman', null), bookerEmployeeId: seat('isBooker', staff.find((e) => e.isBooker)?.id ?? null),
        driverEmployeeId: seat('isDeliveryman', null), supervisorEmployeeId: seat('isSupervisor', null),
      };
      const cur = { salesmanEmployeeId: r.salesman?.id ?? null, bookerEmployeeId: r.booker?.id ?? null, driverEmployeeId: r.driver?.id ?? null, supervisorEmployeeId: r.supervisor?.id ?? null };
      if (JSON.stringify(want) === JSON.stringify(cur)) continue;
      await ctx.admin.put(`/distribution/routes/${r.id}/assignment`, { ...want, vehicleId: r.van?.id ?? r.vehicle?.id ?? r.vehicleId ?? null, rowVersion: r.rowVersion });
    }
    const fresh = items(await ctx.admin.get('/distribution/routes'));
    for (const t of T(ctx).routes) {
      const r = fresh.find((x: any) => x.id === t.id);
      Object.assign(t, { salesmanId: r.salesman?.id ?? null, bookerId: r.booker?.id ?? null, driverId: r.driver?.id ?? null });
    }
    ctx.save();
  },
};

// ---------------------------------------------------------------------------------------------------- 1. opening stock
const openingStock: Step = {
  name: 'tx.trade.opening-stock',
  async run(ctx) {
    const existing = items(await ctx.admin.get('/inventory/stock-in-out?mode=IN&pageSize=50'));
    const plan = salesPlan(ctx, '2025-04-01', 0).sales;
    const demand = new Map<string, number>();
    for (const s of plan) {
      const wh = whOfBranch(ctx, custs(ctx).find((c) => c.id === s.c)!.branchId).id;
      for (const l of s.lines) demand.set(`${wh}|${l.p}`, (demand.get(`${wh}|${l.p}`) ?? 0) + units(ctx, l));
    }
    const rng = rngFor('trade.opening');
    const reasonId = await reason(ctx, 'OPENING');
    for (const wh of mainWh(ctx)) {
      const ref = `OPENING-${wh.code}`;
      if (existing.some((x) => x.manualRef === ref)) continue;
      const lines = prods(ctx).map((p) => {
        const d = demand.get(`${wh.id}|${p.id}`) ?? 0;
        const qty = Math.max(p.perCarton, Math.ceil((d * 1.3 + p.perCarton) / p.perCarton) * p.perCarton);
        return {
          itemId: p.id, qty, unitCost: p.cost,
          ...(p.batchTracked ? { newBatchNo: `OB-${p.sku}-${wh.code.slice(3)}`, newExpiryDate: addDays('2025-04-01', rng.int(75, 210)) } : {}),
        };
      });
      const doc: any = await ctx.admin.post('/inventory/stock-in-out', {
        mode: 'IN', docDate: '2025-04-01', warehouseId: wh.id, reasonId, manualRef: ref, notes: 'Opening stock on go-live (stock take 31 Mar 2025)', lines,
      });
      await ctx.admin.post(`/inventory/stock-in-out/${doc.id}/post`, { rowVersion: doc.rowVersion });
      ctx.log(`  opening stock ${wh.code}: ${lines.length} items, value ${Math.round(doc.totalValue ?? 0).toLocaleString()}`);
    }
  },
};

// ---------------------------------------------------------------------------------------------------- 2. monthly cycle
function monthStep(month: string, i: number, pass = ''): Step {
  const pid = `${month.slice(0, 7)}${pass}`;
  return {
    name: `tx.trade.${pid}`,
    async run(ctx) {
      // ctx.save() may swap ctx.state.ids for the merged copy, so x is re-read after every save.
      let x = tt(ctx);
      const tenant = TID(ctx);
      // Leftovers of finished months (an earlier run stopped between finishing a month and saving its cleanup).
const stepOf = (key: string) => `tx.trade.${key.split('-').slice(0, 2).join('-')}`;
      for (const p of Object.keys(x.plans)) if (ctx.state.done.includes(p.length === 10 ? `tx.trade.${p.slice(0, 7)}` : stepOf(p))) delete x.plans[p];
      for (const key of Object.keys(x.done)) if (ctx.state.done.includes(stepOf(key))) delete x.done[key];
      const apis = await adminSessions(ctx, 3);
      const next = rr(apis);
      const done = (k: string) => k in x.done;
      const mark = (k: string, id: string) => { x.done[k] = id; };
      const save = () => { ctx.save(); x = tt(ctx); };

      // Plan (kept until the month finishes, so a re-run continues the same plan).
      if (!x.plans[pid]) {
        const onHand = await stockOnHand(tenant);
        const raw = salesPlan(ctx, month, i, pid);
        const po = purchasePlan(ctx, month, raw.sales, onHand, pid);
        x.plans[pid] = { po, sales: capSales(ctx, raw.sales, po, onHand), quotesLost: raw.quotesLost } satisfies MonthPlan;
        save();
      }
      const plan: MonthPlan = x.plans[pid];
      const g = await gst(ctx);
      const o = await opts(ctx);
      ctx.log(`  plan: ${plan.po.length} POs, ${plan.sales.length} sales`);

      // A. Purchases: PO → approve → GRN → post → bill → post. Resumable: an existing PO (by its key in the remarks) carries on.
      let k = 0;
      const poFailed: string[] = [];
      await pool(plan.po.filter((p) => !done(p.key)), 4, async (spec) => {
        try { await buy(spec); } catch (e) { poFailed.push(`${spec.key}: ${(e as Error).message.slice(0, 200)}`); }
      });
      save();
      if (poFailed.length) { for (const f of poFailed.slice(0, 5)) ctx.log(`  ! ${f}`); throw new Error(`${poFailed.length} purchases failed in ${month}`); }
      async function buy(spec: PoSpec) {
        const api = next();
        const wh = mainWh(ctx).find((w) => w.id === spec.wh)!;
        const vendor = o.purch.vendors.find((v: any) => v.id === spec.v);
        const remarks = `Monthly replenishment ${month.slice(0, 7)} (${spec.key})`;
        const found = await q<{ id: string }>(`select id from "Purchases"."PurchaseOrders" where "tenantId" = $1 and remarks = $2 and status <> 'CANCELLED'`, [tenant, remarks]);
        let po: any;
        if (found.length) po = await api.get(`/purchases/orders/${found[0].id}`);
        else {
          const lines = spec.lines.map((l) => { const p = prods(ctx).find((x) => x.id === l.p)!; return { itemId: p.id, qtyCtn: l.ctn, qtyLoose: 0, rate: p.cost, taxCodeId: g, taxRate: 18 }; });
          po = await api.post('/purchases/orders', {
            docDate: spec.date, vendorId: spec.v, branchId: wh.branchId, warehouseId: wh.id, expectedDate: spec.grnDate,
            paymentTerms: vendor?.paymentTerms ?? 'NET_30', creditDays: vendor?.creditDays ?? 30, remarks, lines,
          });
          bump(ctx, 'purchaseOrders');
        }
        if (po.status === 'DRAFT') po = await ctx.approver.post(`/purchases/orders/${po.id}/approve`, { comment: 'Approved against the monthly plan' });
        let grnRef = (po.grns ?? []).find((x: any) => x.status !== 'CANCELLED');
        if (!grnRef) {
          grnRef = await api.post('/purchases/grns', {
            docDate: spec.grnDate, purchaseOrderId: po.id, vendorId: spec.v, branchId: wh.branchId, warehouseId: wh.id, vendorRef: `DN-${po.docNo}`,
            lines: po.lines.map((pl: any) => {
              const p = prods(ctx).find((x) => x.id === pl.item.id)!;
              const life = T(ctx).classes.find((c: any) => c.id === p.classId)?.name === 'Dairy' ? [60, 150] : [120, 330];
              const exp = addDays(spec.grnDate, rngFor(`exp.${spec.key}.${p.sku}`).int(life[0], life[1]));
              return {
                purchaseOrderLineId: pl.id, itemId: pl.item.id, orderedQty: pl.baseQty, prevReceivedQty: 0, acceptedQty: pl.baseQty, unitCost: pl.rate,
                ...(p.batchTracked ? { batchNo: `${p.sku.slice(0, 3)}${spec.grnDate.replace(/-/g, '').slice(2)}${p.sku.slice(-2)}`, expiryDate: exp } : {}),
              };
            }),
          });
          bump(ctx, 'grns');
        }
        let grn: any = await api.get(`/purchases/grns/${grnRef.id}`);
        if (grn.status === 'DRAFT') { await api.post(`/purchases/grns/${grn.id}/post`, { rowVersion: grn.rowVersion }); grn = await api.get(`/purchases/grns/${grn.id}`); }
        let billRef = (grn.bills ?? []).find((x: any) => x.status !== 'VOID');
        if (!billRef) {
          billRef = await api.post('/purchases/bills', {
            docDate: spec.grnDate, vendorId: spec.v, branchId: wh.branchId, warehouseId: wh.id, purchaseOrderId: po.id, grnId: grn.id,
            vendorInvoiceNo: `${vendor?.code ?? 'INV'}-${spec.key.slice(2).replace(/-/g, '').toUpperCase()}${wh.code.slice(3, 4)}`,
            lines: grn.lines.map((gl: any) => {
              const pl = po.lines.find((x: any) => x.id === gl.purchaseOrderLineId);
              return { itemId: gl.item.id, grnLineId: gl.id, purchaseOrderLineId: gl.purchaseOrderLineId, qtyCtn: 0, qtyLoose: gl.acceptedQty, rate: gl.unitCost, taxCodeId: g, taxRate: 18, batchNo: gl.batchNo, expiryDate: gl.expiryDate, discountPct: pl?.discountPct ?? 0 };
            }),
          });
          bump(ctx, 'bills');
        }
        const bill: any = await api.get(`/purchases/bills/${billRef.id}`);
        if (bill.status === 'DRAFT') await api.post(`/purchases/bills/${bill.id}/post`, { rowVersion: bill.rowVersion });
        mark(spec.key, bill.id);
        if (++k % 8 === 0) save();
      }

      // B. Sales: direct invoices, order flows (quotation → order → challan → invoice), lost quotations.
      const custOpt = (id: string) => o.sales.customers.find((c: any) => c.id === id);
      const routes: any[] = T(ctx).routes;
      const emp = (id: string | null) => (ctx.state.ids.people.employees as any[]).find((e) => e.id === id);
      const staffOf = (c: Cust) => {
        const r = routes.find((x) => x.customerIds.includes(c.id));
        if (!r) return {};
        const sm = emp(r.salesmanId); const bk = emp(r.bookerId); const dv = emp(r.driverId);
        return {
          routeId: r.id, salesmanEmployeeId: r.salesmanId, bookerEmployeeId: r.bookerId, salesmanName: sm?.name ?? null, bookerName: bk?.name ?? null,
          deliverymanName: dv?.name ?? null, salesRepUserId: x.users[r.salesmanId] ?? null, vanId: r.vanId,
        };
      };
      const saleLines = (s: SaleSpec, c: Cust) => s.lines.map((l) => {
        const p = prods(ctx).find((pp) => pp.id === l.p)!;
        const f = ({ RETAIL: 1.13, WHOLESALE: 1.07, SUPERSTORE: 1.08, INSTITUTIONAL: 1.1 } as Record<string, number>)[c.group] ?? 1;
        return { itemId: p.id, qtyCtn: l.ctn, qtyLoose: l.loose, rate: Math.round(p.price * f * 100) / 100, discountPct: c.group === 'SUPERSTORE' ? 2 : 0, taxCodeId: g, taxRate: 18 };
      });
      const vanReg = (id: string | null) => T(ctx).vans.find((v: any) => v.id === id)?.regNo ?? 'LEA-4521';

      // Recovery after an interrupted run: invoices already posted for a plan entry (same customer, date and items).
      {
        const have = await q<{ id: string; customerId: string; d: string; status: string; rowVersion: number; remarks: string | null; items: string }>(
          `select i.id, i."customerId", i."docDate"::text as d, i.status, i."rowVersion", i.remarks, string_agg(l."itemId"::text, ',' order by l."itemId"::text) as items
             from "Sales"."SalesInvoices" i join "Sales"."SalesInvoiceLines" l on l."invoiceId" = i.id
            where i."tenantId" = $1 and i."docDate" between $2::date and $3::date and i.status <> 'VOID' group by i.id`, [tenant, month, monthEnd(month)]);
        const used = new Set(Object.values(x.done));
        for (const s of plan.sales.filter((sp) => !done(sp.key))) {
          const sig = s.lines.map((l) => l.p).sort().join(',');
          const hit = have.find((h) => !used.has(h.id) && (h.remarks === s.key || (h.customerId === s.c && h.d === s.date && h.items === sig)));
          if (!hit) continue;
          if (hit.status === 'DRAFT') await ctx.admin.post(`/sales/invoices/${hit.id}/post`, { rowVersion: hit.rowVersion });
          used.add(hit.id);
          mark(s.key, hit.id);
        }
        save();
      }
      const failed: string[] = [];
      await pool(plan.sales.filter((s) => !done(s.key)), 6, async (s) => { try { await sell(s); } catch (e) { failed.push(`${s.key}: ${(e as Error).message.slice(0, 200)}`); } });
      save();
      if (failed.length) { for (const f of failed.slice(0, 5)) ctx.log(`  ! ${f}`); throw new Error(`${failed.length} sales failed in ${month}`); }
      async function sell(s: SaleSpec) {
        const api = next();
        const c = custs(ctx).find((cc) => cc.id === s.c)!;
        const co = custOpt(c.id);
        const wh = whOfBranch(ctx, c.branchId);
        const st: any = staffOf(c);
        const terms = co?.paymentTerms ?? 'NET_30';
        const { vanId, ...staff } = st;
        if (s.flow === 'DIRECT') {
          const inv: any = await api.post('/sales/invoices', {
            customerId: c.id, docDate: s.date, branchId: c.branchId, warehouseId: wh.id, paymentTerms: terms, submitToFbr: false,
            saleType: c.group === 'WHOLESALE' ? 'WHOLESALE' : c.group === 'SUPERSTORE' ? 'DISTRIBUTOR' : 'REGULAR', remarks: s.key, ...staff, lines: saleLines(s, c),
          });
          await postRetry(api, `/sales/invoices/${inv.id}/post`, { rowVersion: inv.rowVersion });
          mark(s.key, inv.id); bump(ctx, 'invoices');
          if (Object.keys(x.done).length % 10 === 0) save();
          return;
        }
        let order: any;
        // A quotation can only be accepted / converted while still valid today, so older months order directly.
        if (s.flow === 'Q' && addDays(s.date, 30) >= today()) {
          const qt: any = await api.post('/sales/quotations', {
            customerId: c.id, docDate: addDays(s.date, -3) < month ? s.date : addDays(s.date, -3), validTill: addDays(s.date, 30), subject: 'Monthly stock offer',
            branchId: c.branchId, salesRepUserId: staff.salesRepUserId ?? null, lines: saleLines(s, c),
          });
          const sent: any = await api.post(`/sales/quotations/${qt.id}/send`, { rowVersion: qt.rowVersion });
          const acc: any = await api.post(`/sales/quotations/${qt.id}/accept`, { rowVersion: sent.rowVersion });
          order = await api.post(`/sales/quotations/${qt.id}/convert-to-order`, { rowVersion: acc.rowVersion, docDate: s.date, expectedDeliveryDate: addDays(s.date, 1), warehouseId: wh.id, reserveStock: true });
          order = order.order ?? (order.id && order.docNo?.startsWith('SO') ? order : await api.get(`/sales/orders/${order.salesOrderId ?? order.order?.id ?? order.id}`));
          bump(ctx, 'quotations');
        } else {
          order = await api.post('/sales/orders', {
            customerId: c.id, docDate: s.date, branchId: c.branchId, warehouseId: wh.id, expectedDeliveryDate: addDays(s.date, 1), paymentTerms: terms,
            salesRepUserId: staff.salesRepUserId ?? null, customerPoRef: c.group === 'RETAIL' ? null : `PO-${c.code.slice(-4)}-${s.key.slice(-3)}`, reserveStock: true, remarks: s.key, lines: saleLines(s, c),
          });
        }
        order = await ctx.approver.post(`/sales/orders/${order.id}/approve`, { comment: null, overrideCredit: false });
        bump(ctx, 'orders');
        if (s.stop === 'ORDER') { mark(s.key, order.id); return; }
        const dc: any = await api.post('/sales/challans', {
          salesOrderId: order.id, docDate: s.date, warehouseId: wh.id, vehicleId: vanId ?? null, vehicleNo: vanReg(vanId ?? null), driverName: staff.deliverymanName ?? null,
          lines: order.lines.map((l: any) => ({ salesOrderLineId: l.id, qty: l.baseQty + (l.bonusQty ?? 0) })),
        });
        const dsp: any = await postRetry(api, `/sales/challans/${dc.id}/dispatch`, { rowVersion: dc.rowVersion });
        bump(ctx, 'challans');
        if (s.stop === 'CHALLAN') { mark(s.key, dc.id); return; }
        const dlv: any = await api.post(`/sales/challans/${dc.id}/deliver`, { rowVersion: dsp.rowVersion, receivedBy: c.name.split(',')[0] });
        const inv: any = await api.post('/sales/invoices', {
          customerId: c.id, docDate: s.date, branchId: c.branchId, warehouseId: wh.id, salesOrderId: order.id, deliveryChallanId: dc.id, paymentTerms: terms, submitToFbr: false,
          customerPoNo: order.customerPoRef ?? null, remarks: s.key, ...staff,
          lines: dlv.lines.map((dl: any) => {
            const ol = order.lines.find((x: any) => x.id === dl.salesOrderLineId);
            return { itemId: dl.item.id, qtyCtn: 0, qtyLoose: dl.baseQty, rate: ol.rate, discountPct: ol.discountPct, taxCodeId: ol.taxCode?.id ?? g, taxRate: ol.taxRate, salesOrderLineId: ol.id, deliveryChallanLineId: dl.id, batchId: dl.batchId };
          }),
        });
        await postRetry(api, `/sales/invoices/${inv.id}/post`, { rowVersion: inv.rowVersion });
        mark(s.key, inv.id); bump(ctx, 'invoices');
        if (Object.keys(x.done).length % 10 === 0) save();
      }
      // Quotations that didn't convert: one rejected, the others left sent (they show as expired once past validity).
      await pool(plan.quotesLost.filter((s) => !done(s.key)), 3, async (s, j) => {
        const api = next();
        const c = custs(ctx).find((cc) => cc.id === s.c)!;
        const qt: any = await api.post('/sales/quotations', {
          customerId: c.id, docDate: s.date, validTill: addDays(s.date, 10), subject: j === 0 ? 'Bulk offer: festive season' : 'Price offer', branchId: c.branchId, lines: saleLines(s, c),
        });
        const sent: any = await api.post(`/sales/quotations/${qt.id}/send`, { rowVersion: qt.rowVersion });
        if (j === 0) await soft(ctx, 'reject quotation', () => api.post(`/sales/quotations/${qt.id}/reject`, { rowVersion: sent.rowVersion, reason: 'Customer found a lower price elsewhere' }));
        mark(s.key, qt.id); bump(ctx, 'quotations');
      });
      save();

      const end = capDate(monthEnd(month));
      const rng = rngFor(`trade.after.${pid === month.slice(0, 7) ? month : pid}`);

      // C. Sales returns (against this month's invoices) and rate-difference credit notes.
      if (!done(`${pid}-C`)) {
        const posted = await q<{ id: string; customerId: string; branchId: string; docDate: string; warehouseId: string }>(
          `select id, "customerId", "branchId", "docDate"::text, "warehouseId" from "Sales"."SalesInvoices"
            where "tenantId" = $1 and status in ('POSTED','PARTIALLY_PAID') and "docDate" between $2::date and $3::date order by "docNo"`, [tenant, month, addDays(end, -8)]);
        for (const inv of rng.sample(posted, 4)) {
          await soft(ctx, 'sales return', async () => {
            const lines = await q<{ id: string; itemId: string; baseQty: string; rate: string; discountPct: string; taxRate: string; taxCodeId: string; track: boolean }>(
              `select l.id, l."itemId", l."baseQty", l.rate, l."discountPct", l."taxRate", l."taxCodeId", p."trackExpiry" as track
                 from "Sales"."SalesInvoiceLines" l join "Inventory"."Products" p on p.id = l."itemId" where l."invoiceId" = $1 and not p."trackExpiry"`, [inv.id]);
            if (!lines.length) return;
            const pick = rng.sample(lines, rng.int(1, 2));
            const why = rng.pick(['DAMAGED', 'CUSTOMER_REQUEST', 'WRONG_ITEM', 'DAMAGED']);
            const ret: any = await next().post('/sales/returns', {
              returnType: 'AGAINST_INVOICE', docDate: capDate(addDays(inv.docDate, rng.int(2, 7))), customerId: inv.customerId, invoiceId: inv.id, branchId: inv.branchId, warehouseId: inv.warehouseId,
              remarks: why === 'DAMAGED' ? 'Cartons damaged in transit' : 'Customer returned unsold goods',
              lines: pick.map((l) => ({
                invoiceLineId: l.id, itemId: l.itemId, qty: Math.max(1, Math.floor(Number(l.baseQty) * rng.int(10, 40) / 100)), rate: Number(l.rate),
                discountPct: Number(l.discountPct), taxCodeId: l.taxCodeId, taxRate: Number(l.taxRate), reason: why, disposition: why === 'DAMAGED' ? 'WRITE_OFF' : 'RESTOCK',
              })),
            });
            await next().post(`/sales/returns/${ret.id}/post`, { rowVersion: ret.rowVersion });
            bump(ctx, 'salesReturns');
          });
        }
        const open = (await openInvoices(tenant)).filter((v) => v.docDate >= month && v.docDate <= end);
        for (const inv of rng.sample(open, 2)) {
          await soft(ctx, 'credit note', async () => {
            const amt = r2(Math.min(Number(inv.balance) * 0.5, Math.max(500, Number(inv.net) * 0.02)));
            const cn: any = await next().post('/sales/credit-notes', {
              docDate: capDate(addDays(inv.docDate, rng.int(3, 10))), customerId: inv.customerId, invoiceId: inv.id, branchId: inv.branchId, reason: 'RATE_DIFFERENCE',
              reasonNote: 'Agreed trade price revision', treatment: 'APPLY_TO_INVOICE', lines: [{ description: 'Rate difference on invoiced goods', qty: 1, rate: amt, taxRate: 0 }],
            });
            await next().post(`/sales/credit-notes/${cn.id}/post`, { rowVersion: cn.rowVersion });
            bump(ctx, 'creditNotes');
          });
        }
        mark(`${pid}-C`, 'ok'); save();
      }

      // D. Customer receipts: invoices whose (stable, per-invoice) payment date falls in this month, grouped per customer and week.
      if (!done(`${pid}-D`)) {
        const payDate = (inv: { id: string; dueDate: string }) => {
          const h = h01(`pay:${inv.id}`);
          const r = new Rng(Math.floor(h * 1e9));
          if (h < 0.7) return addDays(inv.dueDate, r.int(-6, 8));
          if (h < 0.88) return addDays(inv.dueDate, r.int(15, 45));
          if (h < 0.96) return addDays(inv.dueDate, r.int(50, 110));
          return '9999-12-31';
        };
        const due = (await openInvoices(tenant)).map((v) => ({ ...v, pay: payDate(v) })).filter((v) => v.pay <= end && v.pay >= addDays(month, -400));
        const groups = new Map<string, typeof due>();
        for (const v of due) {
          const pay = v.pay < month ? month : v.pay;
          const wk = `${v.customerId}|${pay.slice(0, 8)}${String(Math.min(4, Math.floor((Number(pay.slice(8, 10)) - 1) / 7))).padStart(2, '0')}`;
          groups.set(wk, [...(groups.get(wk) ?? []), { ...v, pay }]);
        }
        const bankFor = (branchId: string) => (ctx.state.ids.company.bankAccounts as any[]).find((b) => b.purpose === (branchCodeOf(ctx, branchId) === 'KHI' ? 'COLLECTIONS' : 'PRIMARY')).id;
        const cashFor = (branchId: string) => o.recv.cashAccounts.find((a: any) => a.branchId === branchId && /main|cash in hand/i.test(a.name))?.id
          ?? (ctx.state.ids.company.cashAccounts as any[]).find((cc) => cc.branchId === branchId)?.accountId;
        const custRows = await q<{ id: string; deductsWht: boolean; whtSection: string | null; whtRate: string | null }>(
          `select id, "deductsWht", "whtSection", "whtRate" from "Sales"."Customers" where "tenantId" = $1`, [tenant]);
        let n = 0;
        await pool([...groups.values()], 6, async (grp) => {
          const c = custs(ctx).find((cc) => cc.id === grp[0].customerId)!;
          const cr = custRows.find((r) => r.id === c.id);
          const date = capDate(grp.reduce((m, v) => (v.pay > m ? v.pay : m), grp[0].pay));
          const total = r2(grp.reduce((s, v) => s + Number(v.balance), 0));
          const wht = cr?.deductsWht ? r2(total * Number(cr.whtRate ?? 5) / 100 / 1.18) : 0;
          const recent = date >= addDays(today(), -60);
          const method = c.group === 'RETAIL' ? (rng.chance(0.75) ? 'CASH' : 'IBFT') : recent && rng.chance(0.25) ? 'CHEQUE' : rng.chance(0.15) ? 'RAAST' : 'IBFT';
          await next().post('/receivables/receipts', {
            docDate: date, customerId: c.id, branchId: c.branchId, method,
            cashAccountId: method === 'CASH' ? cashFor(c.branchId) : null, bankAccountId: method === 'CASH' ? null : bankFor(c.branchId),
            reference: method === 'CHEQUE' ? String(rng.int(10000000, 99999999)) : method === 'CASH' ? null : `TRX${date.replace(/-/g, '')}${rng.int(1000, 9999)}`,
            amountReceived: r2(total - wht), whtAmount: wht, whtSection: wht > 0 ? (cr?.whtSection ?? '153_1_A') : null,
            memo: grp.length > 1 ? `Against ${grp.length} invoices` : null, allocations: grp.map((v) => ({ invoiceId: v.id, amount: Number(v.balance) })),
          });
          bump(ctx, 'receipts');
          if (++n % 20 === 0) save();
        });
        mark(`${pid}-D`, 'ok'); save();
      }

      // E. Vendor payments: payment runs around the 10th and 25th, bills whose payment date has come.
      if (!done(`${pid}-E`)) {
        const runDays = workDays(month).filter((d) => d <= today());
        const runs = [runDays.find((d) => d >= `${month.slice(0, 8)}10`), runDays.find((d) => d >= `${month.slice(0, 8)}25`)].filter(Boolean) as string[];
        const payOn = (b: { id: string; dueDate: string }) => {
          const h = h01(`vpay:${b.id}`);
          if (h < 0.86) return addDays(b.dueDate, Math.floor(h * 12) - 4);
          if (h < 0.97) return addDays(b.dueDate, 20 + Math.floor(h * 20));
          return '9999-12-31';
        };
        for (const run of runs) {
          const bills = (await openBills(tenant)).filter((b) => payOn(b) <= run);
          const byBranch = new Map<string, typeof bills>();
          for (const b of bills) byBranch.set(b.branchId, [...(byBranch.get(b.branchId) ?? []), b]);
          for (const [branchId, list] of byBranch) {
            const bank = (ctx.state.ids.company.bankAccounts as any[]).find((b) => b.purpose === (branchCodeOf(ctx, branchId) === 'KHI' ? 'COLLECTIONS' : 'PRIMARY'));
            const cheque = run >= addDays(today(), -75) && rng.chance(0.4);
            const vendors = [...new Set(list.map((b) => b.vendorId))];
            const cheques: Record<string, string> = {};
            if (cheque) for (const v of vendors) cheques[v] = String(x.chequeNo++);
            const r: any = await ctx.admin.post('/payables/payment-run', {
              docDate: run, branchId, method: cheque ? 'CHEQUE' : 'IBFT', bankAccountId: bank.id, whtTreatment: 'ALREADY_WITHHELD',
              remarks: `Payment run ${run}`, cheques, bills: list.map((b) => ({ billId: b.id, amount: Number(b.balance), whtRate: 0 })),
            });
            bump(ctx, 'vendorPayments', r.payments?.length ?? 0);
            for (const f of r.failed ?? []) ctx.log(`  ! payment to ${f.vendor?.name}: ${f.message}`);
          }
        }
        mark(`${pid}-E`, 'ok'); save();
      }

      // F. Service bills: freight, fuel, vehicle repairs, forklift rental, packaging (rent and utilities are ledger vouchers).
      if (!done(`${pid}-F`)) {
        const acc = ctx.state.ids.company.accounts as Record<string, string>;
        const vend = (code: string) => T(ctx).vendors.find((v: any) => v.code === code);
        const svc = [
          ['VEN-0009', 'HO', 'Freight inward: principal deliveries to Lahore', '5110-03', [60000, 140000]],
          ['VEN-0010', 'KHI', 'Freight: Karachi port and city deliveries', '5230-01', [40000, 95000]],
          ['VEN-0011', 'ISB', 'Freight inward: Lahore to Islamabad line haul', '5110-03', [35000, 80000]],
          ['VEN-0017', 'HO', 'Diesel and petrol for delivery vans (fleet card)', '5230-02', [90000, 180000]],
          ['VEN-0026', 'HO', 'Van servicing and repairs', '5230-02', [15000, 60000]],
          ['VEN-0029', 'HO', 'Forklift rental', '5220-04', [25000, 35000]],
          ['VEN-0020', 'HO', 'Shrink wrap and carton packaging', '5240-13', [18000, 45000]],
        ] as const;
        const date = runDaysOr(month, 20);
        for (const [code, b, desc, account, [lo, hi]] of svc) {
          if (code === 'VEN-0026' && !rng.chance(0.6)) continue;
          if (code === 'VEN-0020' && !rng.chance(0.5)) continue;
          await soft(ctx, `service bill ${code}`, async () => {
            const v = vend(code);
            const bill: any = await ctx.admin.post('/purchases/bills', {
              docDate: date, vendorId: v.id, branchId: br(ctx, b).id, vendorInvoiceNo: `${code.slice(-2)}-${month.slice(2, 7).replace('-', '')}-${rng.int(100, 999)}`,
              remarks: desc, lines: [{ description: `${desc} (${month.slice(0, 7)})`, accountId: acc[account], qtyCtn: 0, qtyLoose: 1, rate: rng.money(lo, hi, 100), taxRate: 0 }],
            });
            await ctx.admin.post(`/purchases/bills/${bill.id}/post`, { rowVersion: bill.rowVersion });
            bump(ctx, 'serviceBills');
          });
        }
        mark(`${pid}-F`, 'ok'); save();
      }

      // G. Stock housekeeping at month end: expired batches written off, damage write-off, a spot-check adjustment,
      //    a purchase return and a debit note to a principal, a quarterly cycle count.
      if (!done(`${pid}-G`)) {
        const day = capDate(lastWorkDay(month));
        const expired = (await expiringStock(tenant, addDays(day, -1))).filter((e) => mainWh(ctx).some((w) => w.id === e.warehouseId));
        const byWh = new Map<string, typeof expired>();
        for (const e of expired) byWh.set(e.warehouseId, [...(byWh.get(e.warehouseId) ?? []), e]);
        for (const [wh, list] of byWh) {
          await soft(ctx, 'expired write-off', async () => {
            const doc: any = await ctx.admin.post('/inventory/stock-in-out', {
              mode: 'OUT', docDate: day, warehouseId: wh, reasonId: await reason(ctx, 'EXPIRED'), notes: 'Month-end expiry sweep',
              lines: list.map((e) => ({ itemId: e.itemId, batchId: e.batchId, qty: Number(e.qty), unitCost: 0 })),
            });
            await ctx.admin.post(`/inventory/stock-in-out/${doc.id}/post`, { rowVersion: doc.rowVersion });
            bump(ctx, 'stockOuts');
          });
        }
        const onHand = await stockOnHand(tenant);
        const nonBatch = prods(ctx).filter((p) => !p.batchTracked);
        const wh = mainWh(ctx)[i % 3];
        const damaged = rng.sample(nonBatch, 2).filter((p) => (onHand.get(`${wh.id}|${p.id}`) ?? 0) > p.perCarton);
        if (damaged.length) await soft(ctx, 'damage write-off', async () => {
          const doc: any = await ctx.admin.post('/inventory/stock-in-out', {
            mode: 'OUT', docDate: day, warehouseId: wh.id, reasonId: await reason(ctx, 'DAMAGED'), notes: 'Damaged in the warehouse (forklift handling)',
            lines: damaged.map((p) => ({ itemId: p.id, qty: rng.int(2, Math.max(2, Math.floor(p.perCarton / 2))), unitCost: 0 })),
          });
          await ctx.admin.post(`/inventory/stock-in-out/${doc.id}/post`, { rowVersion: doc.rowVersion });
          bump(ctx, 'stockOuts');
        });
        const spot = rng.sample(nonBatch, 3).filter((p) => (onHand.get(`${wh.id}|${p.id}`) ?? 0) > 10);
        if (spot.length) await soft(ctx, 'spot-check adjustment', async () => {
          const adj: any = await ctx.admin.post('/inventory/adjustments', {
            docDate: day, warehouseId: wh.id, reasonId: await reason(ctx, 'COUNT_VARIANCE'), remarks: 'Spot check at month end',
            lines: spot.map((p) => { const have = onHand.get(`${wh.id}|${p.id}`) ?? 0; return { itemId: p.id, qtyCounted: Math.max(0, have + (rng.chance(0.7) ? -rng.int(1, 4) : rng.int(1, 2))) }; }),
          });
          await ctx.admin.post(`/inventory/adjustments/${adj.id}/post`, { rowVersion: adj.rowVersion });
          bump(ctx, 'adjustments');
        });
        // Purchase return of damaged goods to a principal, against one of the month's bills.
        await soft(ctx, 'purchase return', async () => {
          const bills = await q<{ id: string; vendorId: string; branchId: string; warehouseId: string }>(
            `select b.id, b."vendorId", b."branchId", b."warehouseId" from "Purchases"."VendorBills" b where b."tenantId" = $1 and b.status in ('POSTED','PARTIALLY_PAID','PAID')
               and b."docDate" between $2::date and $3::date and b."grnId" is not null order by b."docNo"`, [tenant, month, day]);
          const b = bills.length ? bills[rng.int(0, bills.length - 1)] : null;
          if (!b) return;
          const bl = await q<{ id: string; itemId: string; baseQty: string; rate: string; taxRate: string; taxCodeId: string }>(
            `select l.id, l."itemId", l."baseQty", l.rate, l."taxRate", l."taxCodeId" from "Purchases"."VendorBillLines" l join "Inventory"."Products" p on p.id = l."itemId"
              where l."billId" = $1 and not p."trackExpiry"`, [b.id]);
          const now = await stockOnHand(tenant);
          const line = bl.find((l) => (now.get(`${b.warehouseId}|${l.itemId}`) ?? 0) > 12);
          if (!line) return;
          const ret: any = await ctx.admin.post('/purchases/returns', {
            docDate: day, vendorId: b.vendorId, branchId: b.branchId, warehouseId: b.warehouseId, billId: b.id, reason: rng.pick(['DAMAGED', 'QUALITY']),
            transporter: 'Al-Madina Goods Transport', remarks: 'Returned to principal for replacement credit',
            lines: [{ billLineId: line.id, itemId: line.itemId, returnQty: Math.min(12, Math.floor(Number(line.baseQty) / 4) || 1), rate: Number(line.rate), taxCodeId: line.taxCodeId, taxRate: Number(line.taxRate) }],
          });
          await ctx.admin.post(`/purchases/returns/${ret.id}/post`, { rowVersion: ret.rowVersion });
          bump(ctx, 'purchaseReturns');
        });
        // A price-variance debit note every other month.
        if (i % 2 === 1) await soft(ctx, 'debit note', async () => {
          const open = (await openBills(tenant)).filter((b) => b.docDate >= month && b.docDate <= day);
          const b = open.length ? open[rng.int(0, open.length - 1)] : null;
          if (!b) return;
          const bl = (await q<{ id: string }>(`select id from "Purchases"."VendorBillLines" where "billId" = $1 order by "lineNo" limit 1`, [b.id]))[0];
          if (!bl) return;
          const dn: any = await ctx.admin.post('/purchases/debit-notes', {
            docDate: day, billId: b.id, reason: 'PRICE_VARIANCE', reasonNote: 'Billed above the agreed trade price', settlement: 'ADJUST_AGAINST_BILL',
            lines: [{ billLineId: bl.id, description: 'Price difference on billed goods', returnQty: 1, rate: r2(Math.min(Number(b.balance) * 0.3, rng.money(3000, 12000, 50))), taxRate: 0 }],
          });
          await ctx.admin.post(`/purchases/debit-notes/${dn.id}/post`, { rowVersion: dn.rowVersion });
          bump(ctx, 'debitNotes');
        });
        // Quarterly cycle count of one product class in one warehouse (approved by the approver).
        if (['03', '06', '09', '12'].includes(month.slice(5, 7)) && monthEnd(month) <= today()) await soft(ctx, 'cycle count', async () => {
          const cls = T(ctx).classes[i % T(ctx).classes.length];
          const cw = mainWh(ctx)[(i / 3) % 3 | 0];
          const c: any = await ctx.admin.post('/inventory/counts', { name: `Q-end cycle count: ${cls.name} (${cw.code})`, docDate: day, warehouseId: cw.id, scopeClassIds: [cls.id], isBlind: true });
          const fz: any = await ctx.admin.post(`/inventory/counts/${c.id}/freeze`, { rowVersion: c.rowVersion });
          const lines = (fz.lines ?? []).map((l: any) => {
            const sys = Number(l.expectedQty ?? 0);
            const off = sys > 3 && rng.chance(0.12) ? -rng.int(1, 3) : 0;
            return { id: l.id, countedQty: Math.max(0, sys + off), reason: off ? rng.pick(['MISCOUNT', 'DAMAGED', 'THEFT']) : null };
          });
          const en: any = lines.length ? await ctx.admin.post(`/inventory/counts/${c.id}/lines`, { rowVersion: fz.rowVersion, lines }) : fz;
          await ctx.approver.post(`/inventory/counts/${c.id}/approve`, { rowVersion: en.rowVersion, comment: 'Variances checked with the storekeeper' });
          bump(ctx, 'stockCounts');
        });
        mark(`${pid}-G`, 'ok'); save();
      }

      // H. Current month only: transfers between warehouses (receipts are dated today by the system, so only recent ones).
      if (monthEnd(month) >= today() && !done(`${pid}-H`)) {
        const onHand = await stockOnHand(tenant);
        const [lhr, khi, isb] = ['WH-LHR', 'WH-KHI', 'WH-ISB'].map((c) => mainWh(ctx).find((w) => w.code === c)!);
        const lcs = T(ctx).warehouses.find((w: any) => w.code === 'WH-LCS');
        const plans = [[lhr, isb, true], [lhr, lcs, true], [lhr, khi, false]] as const;
        for (const [k2, [from, to, receive]] of plans.entries()) {
          await soft(ctx, 'transfer', async () => {
            const pick = rng.sample(prods(ctx).filter((p) => !p.batchTracked && (onHand.get(`${from.id}|${p.id}`) ?? 0) >= p.perCarton * 4), 4);
            if (!pick.length) return;
            const t: any = await ctx.admin.post('/inventory/transfers', {
              docDate: workDays(month)[Math.min(workDays(month).length - 1, 2 + k2 * 2)], fromWarehouseId: from.id, toWarehouseId: to.id, carrier: 'Own fleet', driverName: 'Asif Nawaz', vehicleNo: 'LEB-7788',
              remarks: receive ? 'Stock balancing between branches' : 'In transit to Karachi', lines: pick.map((p) => ({ itemId: p.id, qtyCtn: rng.int(1, 3), qtyLoose: 0 })),
            });
            const d: any = await ctx.admin.post(`/inventory/transfers/${t.id}/dispatch`, { rowVersion: t.rowVersion });
            if (receive) await ctx.approver.post(`/inventory/transfers/${t.id}/receive`, { rowVersion: d.rowVersion, note: 'Received in full', lines: [] });
            bump(ctx, 'transfers');
          });
        }
        mark(`${pid}-H`, 'ok'); save();
      }

      // Month finished: drop its plan and keys.
      delete x.plans[pid];
      for (const key of Object.keys(x.done)) if (stepOf(key) === `tx.trade.${pid}`) delete x.done[key];
      save();
      const c = x.counts;
      ctx.log(`  totals: ${c.invoices ?? 0} invoices, ${c.bills ?? 0} bills, ${c.receipts ?? 0} receipts, ${c.vendorPayments ?? 0} payments`);
      void (null as unknown as Api);
    },
  };
}

const lastWorkDay = (month: string) => { const d = workDays(month); return d[d.length - 1] ?? month; };
const runDaysOr = (month: string, day: number) => { const d = workDays(month); return d.find((x) => Number(x.slice(8, 10)) >= day) ?? d[d.length - 1]; };

/** April 2025 ran first at a smaller scale; its second pass ('b') brings it to the volume of the later months. */
// ---------------------------------------------------------------------------------------------------- 3. extras
/**
 * Back-fills what earlier month runs skipped: price-variance debit notes on paid bills (refund claims, refunded two weeks
 * later) every other month, and cycle counts left frozen (counted, variances with a reason, approved by the approver).
 */
const extras: Step = {
  name: 'tx.trade.extras',
  async run(ctx) {
    const tenant = TID(ctx);
    const rng = rngFor('trade.extras');
    const haveDn = await q<{ m: string }>(`select distinct to_char("docDate", 'YYYY-MM') as m from "Purchases"."DebitNotes" where "tenantId" = $1`, [tenant]);
    for (const [i, m] of months().entries()) {
      if (i % 2 === 0 || monthEnd(m) > addDays(today(), -20) || haveDn.some((d) => d.m === m.slice(0, 7))) continue;
      await soft(ctx, `debit note ${m.slice(0, 7)}`, async () => {
        const bills = await q<{ id: string; branchId: string; net: string }>(
          `select id, "branchId", "netAmount" as net from "Purchases"."VendorBills" where "tenantId" = $1 and "grnId" is not null and status <> 'VOID'
             and "docDate" between $2::date and $3::date order by "docNo"`, [tenant, m, monthEnd(m)]);
        if (!bills.length) return;
        const b = bills[rng.int(0, bills.length - 1)];
        const bl = (await q<{ id: string }>(`select id from "Purchases"."VendorBillLines" where "billId" = $1 order by "lineNo" limit 1`, [b.id]))[0];
        const day = lastWorkDay(m);
        const amount = rng.money(3000, 12000, 50);
        const dn: any = await ctx.admin.post('/purchases/debit-notes', {
          docDate: day, billId: b.id, reason: 'PRICE_VARIANCE', reasonNote: 'Billed above the agreed trade price; principal to refund', settlement: 'REQUEST_REFUND',
          lines: [{ billLineId: bl.id, description: 'Price difference on billed goods', returnQty: 1, rate: amount, taxRate: 0 }],
        });
        const posted: any = await ctx.admin.post(`/purchases/debit-notes/${dn.id}/post`, { rowVersion: dn.rowVersion });
        const bank = (ctx.state.ids.company.bankAccounts as any[]).find((x) => x.purpose === (branchCodeOf(ctx, b.branchId) === 'KHI' ? 'COLLECTIONS' : 'PRIMARY'));
        await ctx.admin.post(`/purchases/debit-notes/${dn.id}/refund`, { rowVersion: posted.rowVersion, date: capDate(addDays(day, 14)), amount, bankAccountId: bank.id });
        bump(ctx, 'debitNotes');
      });
    }
    const frozen = await q<{ id: string }>(`select id from "Inventory"."StockCounts" where "tenantId" = $1 and status = 'COUNTING' order by "docDate"`, [tenant]);
    for (const c of frozen) {
      await soft(ctx, 'finish cycle count', async () => {
        const cur: any = await ctx.admin.get(`/inventory/counts/${c.id}`);
        const lines = (cur.lines ?? []).map((l: any) => {
          const sys = Number(l.expectedQty ?? 0);
          const off = sys > 3 && rng.chance(0.12) ? -rng.int(1, 3) : 0;
          return { id: l.id, countedQty: Math.max(0, sys + off), reason: off ? rng.pick(['MISCOUNT', 'DAMAGED', 'THEFT']) : null };
        });
        const en: any = lines.length ? await ctx.admin.post(`/inventory/counts/${c.id}/lines`, { rowVersion: cur.rowVersion, lines }) : cur;
        await ctx.approver.post(`/inventory/counts/${c.id}/approve`, { rowVersion: en.rowVersion, comment: 'Variances checked with the storekeeper' });
        bump(ctx, 'stockCounts');
      });
    }
    ctx.save();
  },
};

/** The read-only DB connection is closed after each step (an open connection keeps the process alive). */
const closing = (s: Step): Step => ({ name: s.name, run: async (ctx) => { try { await s.run(ctx); } finally { await closeDb(); } } });
export const steps: Step[] = [routeUsers, openingStock, ...months().flatMap((m, i) => (i === 0 ? [monthStep(m, i), monthStep(m, i, 'b')] : [monthStep(m, i)])), extras].map(closing);
