import { Injectable } from '@nestjs/common';
import type { DistributionQuery, LoadSheetInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { DistributionOpsStore } from '../../common/application/distribution-ops-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const v = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const notEditable = () => new ConflictError('This load sheet can no longer be changed.', undefined, { code: 'LOAD_SHEET_NOT_EDITABLE' });
const changed = () => new ConcurrencyError('This load sheet was changed. Reload and try again.');

/**
 * Load sheets (paperwork only, decided 2026-10-08): the posted wholesale invoices of a route + date go on a run with
 * a pick list (items summed across invoices) and the van; approve → dispatch (gate pass; no stock moves: invoices
 * issued stock when posted). Dispatch opens the run's route settlement with one line per invoice, where the
 * deliveryman marks each invoice delivered / partly / not delivered.
 */
@Injectable()
export class LoadSheetsService {
  constructor(
    private readonly store: DistributionOpsStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  options(user: SessionUser) {
    return this.store.options(user.tenantId);
  }

  candidates(user: SessionUser, routeId: string, date: string) {
    return this.store.candidates(user.tenantId, routeId, date);
  }

  list(user: SessionUser, q: DistributionQuery) {
    return this.store.listLoadSheets(user.tenantId, q);
  }

  async get(user: SessionUser, id: string) {
    const s = await this.store.getLoadSheet(user.tenantId, id);
    if (!s) throw new NotFoundError('Load sheet not found');
    return s;
  }

  async create(user: SessionUser, meta: RequestMeta, input: LoadSheetInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('loadSheetAddUpdate', { ...data, docType: 'LS', status: 'LOADING', preparedByUserId: user.id }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: LoadSheetInput & { rowVersion: number }) {
    const s = await this.get(user, id);
    if (s.rowVersion !== input.rowVersion) throw changed();
    if (s.status !== 'LOADING') throw notEditable();
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('loadSheetAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    if (!(await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('loadSheet', user.tenantId, id, rowVersion)))) throw notEditable();
  }

  async approve(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw changed();
    if (s.status !== 'LOADING') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.set('loadSheet', user.tenantId, id, { status: 'SCHEDULED', checkedByUserId: user.id, loadSheetPrintedAt: new Date() }));
    return this.get(user, id);
  }

  /** Dispatch: gate pass, then the route settlement opens with one line per invoice (amount still owed at dispatch). */
  async dispatch(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw changed();
    if (s.status !== 'SCHEDULED' && s.status !== 'LOADING') throw notEditable();
    const live = s.invoices.filter((i) => !i.released);
    const facts = await this.store.invoiceFacts(user.tenantId, live.map((i) => i.invoice.id));
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.run('loadSheetDispatch', id);
      await this.store.save('routeSettlementAddUpdate', {
        docDate: s.docDate, deliveryRunId: id, branchId: s.branch?.id ?? null, salesmanEmployeeId: s.salesman?.id ?? null, status: 'OPEN',
        invoiceTotal: r2(facts.reduce((t, f) => t + f.balanceAmount, 0)),
        lines: live.map((i, n) => {
          const f = facts.find((x) => x.id === i.invoice.id)!;
          return { lineNo: n + 1, invoiceId: f.id, customerId: f.customerId, invoiceAmount: f.balanceAmount, deliveryState: 'FULL' };
        }),
      });
    });
    return this.get(user, id);
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const s = await this.get(user, id);
    if (s.rowVersion !== rowVersion) throw changed();
    if (s.status === 'CANCELLED') return s;
    if (s.status === 'SETTLED' || s.settlement?.status === 'SETTLED') throw notEditable();
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (s.settlement) await this.store.deleteSettlement(user.tenantId, s.settlement.id);
      await this.store.run('loadSheetCancel', id, reason);
    });
    return this.get(user, id);
  }

  /** The deliveryman marks an invoice delivered / partly / not delivered (only on their own runs, unless they can edit load sheets). */
  async delivery(user: SessionUser, meta: RequestMeta, id: string, invoiceId: string, state: string, reason: string | null) {
    const s = await this.get(user, id);
    if (s.status !== 'DISPATCHED') throw notEditable();
    if (!user.permissions.includes('loadsht:edit')) {
      const me = await this.store.employeeOfUser(user.tenantId, user.id);
      if (!me || me !== s.driver?.id) throw new PermissionDeniedError('Only the run’s deliveryman can update its deliveries.');
    }
    const st = await this.store.getSettlement(user.tenantId, s.settlement!.id);
    const line = st?.lines.find((l) => l.invoice.id === invoiceId);
    if (!st || st.status !== 'OPEN' || !line) throw new NotFoundError('This invoice is not on the run');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setSettlementLine(user.tenantId, line.id, { deliveryState: state, nonDeliveryReason: state === 'FULL' ? null : reason }));
    return this.get(user, id);
  }

  private async payload(user: SessionUser, p: LoadSheetInput) {
    const o = await this.store.options(user.tenantId);
    const e: Record<string, string> = {};
    const route = o.routes.find((r) => r.id === p.routeId);
    const van = o.vans.find((x) => x.id === p.vehicleId);
    if (!route) e.routeId = 'Choose an active route';
    if (!van) e.vehicleId = 'Choose an active van';
    if (!o.employees.some((x) => x.id === p.driverEmployeeId)) e.driverEmployeeId = 'Choose an active employee';
    if (p.salesmanEmployeeId && !o.employees.some((x) => x.id === p.salesmanEmployeeId)) e.salesmanEmployeeId = 'Choose an active employee';
    const facts = await this.store.invoiceFacts(user.tenantId, p.invoiceIds);
    if (facts.length !== p.invoiceIds.length) e.invoiceIds = 'Some invoices were not found';
    facts.forEach((f) => {
      if (f.routeId !== p.routeId) e.invoiceIds = `Invoice ${f.docNo} is not on this route`;
      else if (!['POSTED', 'PARTIALLY_PAID', 'PAID'].includes(f.status)) e.invoiceIds = `Invoice ${f.docNo} is not posted`;
    });
    const source = route?.sourceWarehouseId ?? facts.find((f) => f.warehouseId)?.warehouseId ?? null;
    if (!source && route) e.routeId = 'This route has no source warehouse';
    if (Object.keys(e).length) throw v(e);
    const cands = await this.store.candidates(user.tenantId, p.routeId, p.docDate);
    const byItem = new Map<string, { itemId: string; batchId: string | null; qty: number; ctn: number; value: number }>();
    for (const f of facts) for (const l of f.lines) {
      const k = `${l.itemId}|${l.batchId ?? ''}`;
      const cur = byItem.get(k) ?? { itemId: l.itemId, batchId: l.batchId, qty: 0, ctn: l.ctn, value: 0 };
      cur.qty += l.qty;
      cur.value = r2(cur.value + l.value);
      byItem.set(k, cur);
    }
    const lines = [...byItem.values()].map((l) => ({ itemId: l.itemId, batchId: l.batchId, unitsPerCtn: l.ctn, qtyCtn: Math.floor(l.qty / l.ctn), qtyLoose: r2(l.qty - Math.floor(l.qty / l.ctn) * l.ctn), valueAmount: l.value, weightKg: 0 }));
    const ctnEq = r2(lines.reduce((t, l) => t + (l.qtyCtn * l.unitsPerCtn + l.qtyLoose) / l.unitsPerCtn, 0));
    if (ctnEq > van!.capacityCtn) throw v({ vehicleId: `The load (${ctnEq} cartons) is more than the van carries (${van!.capacityCtn})` });
    return {
      docDate: p.docDate, routeId: p.routeId, branchId: route!.branchId, vehicleId: p.vehicleId, driverEmployeeId: p.driverEmployeeId,
      salesmanEmployeeId: p.salesmanEmployeeId ?? route!.salesmanEmployeeId, sourceWarehouseId: source, departureTime: `${p.departureTime ?? '08:00'}:00`,
      sealNo: p.sealNo ?? null, returnableCrates: p.returnableCrates ?? 0, remarks: p.remarks ?? null,
      invoiceCount: facts.length, shopCount: new Set(facts.map((f) => f.customerId)).size, skuCount: new Set(lines.map((l) => l.itemId)).size,
      totalCtn: lines.reduce((t, l) => t + l.qtyCtn, 0), totalLoose: r2(lines.reduce((t, l) => t + l.qtyLoose, 0)), totalPcs: r2(lines.reduce((t, l) => t + l.qtyCtn * l.unitsPerCtn + l.qtyLoose, 0)),
      totalCtnEquiv: ctnEq, totalKg: 0, totalValue: r2(lines.reduce((t, l) => t + l.valueAmount, 0)), capacityCtn: van!.capacityCtn, capacityKg: van!.capacityKg,
      lines,
      invoices: facts.map((f) => {
        const c = cands.find((x) => x.id === f.id);
        return { invoiceId: f.id, customerId: f.customerId, stopSeq: c?.stopSeq ?? null, lineCount: f.lines.length, ctnEquiv: c?.ctnEquiv ?? 0, invoiceAmount: f.netAmount };
      }),
    };
  }
}
