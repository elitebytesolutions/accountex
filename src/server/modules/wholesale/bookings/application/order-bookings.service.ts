import { Injectable } from '@nestjs/common';
import {
  tierRate, type BookingConvertResult, type BookingInput, type OrderBooking, type SessionUser, type WholesaleOptions, type WholesaleQuery,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../../../core/domain/errors.js';
import { SalesInvoicesService } from '../../../sales/invoices/application/sales-invoices.service.js';
import { WholesaleStore, type BookingScope } from '../../common/application/wholesale-store.js';
import { errorInfo, tierFactor, wholesaleInvoice, wsAmounts } from '../../common/application/wholesale-invoice.js';

const invalid = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));

/**
 * Order bookings taken in the field: NEW → stock check (CHECKED, short lines recorded; first booked, first served) →
 * convert: one posted WHOLESALE invoice for what is in stock, shortages to back-orders (PARTIAL) — or HELD when partial
 * delivery is off. An order booker (no booking:approve) sees and edits only their own bookings and their routes'.
 */
@Injectable()
export class OrderBookingsService {
  constructor(private readonly store: WholesaleStore, private readonly invoices: SalesInvoicesService, private readonly unitOfWork: UnitOfWork) {}

  async list(user: SessionUser, q: WholesaleQuery) {
    return this.store.listBookings(user.tenantId, q, await this.scope(user));
  }

  async get(user: SessionUser, id: string): Promise<OrderBooking> {
    const b = await this.store.getBooking(user.tenantId, id);
    if (!b) throw new NotFoundError('Booking not found');
    await this.assertMine(user, b);
    return b;
  }

  async create(user: SessionUser, meta: RequestMeta, input: BookingInput) {
    const data = await this.payload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('orderBookingAddUpdate', { ...data, bookedAt: new Date().toISOString() }));
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: BookingInput & { rowVersion: number }) {
    const b = await this.current(user, id, input.rowVersion);
    if (b.status !== 'NEW') throw new ConflictError('Only a new booking can be changed.', undefined, { code: 'BOOKING_NOT_OPEN' });
    const data = await this.payload(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('orderBookingAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.get(user, id);
  }

  async remove(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const b = await this.current(user, id, rowVersion);
    if (b.status !== 'NEW') throw new ConflictError('Only a new booking can be deleted; cancel it instead.', undefined, { code: 'BOOKING_NOT_OPEN' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteBooking(user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This booking was changed. Reload and try again.');
  }

  async cancel(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string | null) {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.cancelBooking(id, reason));
    return this.get(user, id);
  }

  /** Stock check of the selected bookings, first booked first served. */
  async checkStock(user: SessionUser, meta: RequestMeta, ids: string[]) {
    for (const id of ids) await this.get(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.checkStock(ids));
    return Promise.all(ids.map((id) => this.get(user, id)));
  }

  /** Converts each booking in its own transaction (one failure doesn't stop the rest). */
  async convert(user: SessionUser, meta: RequestMeta, ids: string[], allowPartial: boolean): Promise<BookingConvertResult> {
    const o = await this.store.options(user.tenantId, user.id, true);
    const res: BookingConvertResult = { invoices: [], held: [], backorderLines: 0, failed: [] };
    const bookings = (await Promise.all(ids.map((id) => this.get(user, id)))).sort((a, b) => a.bookedAt.localeCompare(b.bookedAt));
    for (const b0 of bookings) {
      try {
        await this.unitOfWork.run(actorContext(user, meta), async () => {
          await this.store.checkStock([b0.id]);
          const b = (await this.store.getBooking(user.tenantId, b0.id))!;
          const short = b.lines.some((l) => l.shortQty > 0);
          const give = b.lines.filter((l) => (l.availableQty ?? 0) > 0);
          if ((short && !allowPartial) || !give.length) {
            await this.store.holdBooking(b.id);
            res.held.push(b.docNo);
            return;
          }
          const input = wholesaleInvoice(o, {
            customerId: b.customer.id, docDate: new Date().toISOString().slice(0, 10), warehouseId: b.warehouse!.id, routeId: b.route.id,
            bookerEmployeeId: b.booker?.id ?? null, priceTier: b.priceTier, remarks: `From booking ${b.docNo}`,
          }, give.map((l) => ({ itemId: l.item.id, qtyCtn: 0, qtyLoose: l.availableQty ?? 0, rate: l.rate, taxRate: l.taxRate })));
          const invId = await this.invoices.saveAndPost(user, meta, input, true);
          await this.store.bookingConverted(b.id, invId);
          const inv = await this.invoices.get(user, invId);
          res.invoices.push({ id: invId, docNo: inv.docNo, netAmount: inv.netAmount, customer: b.customer.name });
          res.backorderLines += b.lines.filter((l) => l.shortQty > 0).length;
        });
      } catch (e) {
        const { code, message } = errorInfo(e);
        res.failed.push({ docNo: b0.docNo, code, message });
      }
    }
    return res;
  }

  // ---------------------------------------------------------------- helpers
  /** Bookings scope: null (all) with booking:approve; otherwise the user's employee. */
  private async scope(user: SessionUser): Promise<BookingScope> {
    if (user.permissions.includes('booking:approve')) return null;
    return { employeeId: await this.store.employeeOf(user.tenantId, user.id) };
  }

  private async assertMine(user: SessionUser, b: OrderBooking) {
    const scope = await this.scope(user);
    if (!scope) return;
    const routes = scope.employeeId ? await this.store.routesOf(user.tenantId, scope.employeeId) : [];
    if (b.booker?.id !== scope.employeeId && !routes.includes(b.route.id)) throw new PermissionDeniedError('This booking is on a route you don’t book for.', undefined, { code: 'BOOKING_NOT_YOURS' });
  }

  /** Route, tier and warehouse come from the shop's route profile; rates from the tier unless given; booker = the user's employee or the route's booker. */
  private async payload(user: SessionUser, p: BookingInput) {
    const o: WholesaleOptions = await this.store.options(user.tenantId, user.id, true);
    const e: Record<string, string> = {};
    const shop = o.shops.find((s) => s.customerId === p.customerId);
    if (!shop?.routeId) throw invalid({ customerId: 'This shop isn’t on a route yet (Routes & Salesmen › shops)' });
    const route = o.routes.find((r) => r.id === shop.routeId)!;
    const warehouseId = p.warehouseId ?? route?.warehouseId ?? null;
    if (!warehouseId || !o.warehouses.some((w) => w.id === warehouseId)) e.warehouseId = 'Choose the warehouse the goods leave from';
    const bookerEmployeeId = p.bookerEmployeeId ?? (await this.store.employeeOf(user.tenantId, user.id)) ?? route?.booker?.id ?? null;
    if (!bookerEmployeeId) e.bookerEmployeeId = 'Choose the order booker';
    const factor = tierFactor(o, shop.priceTier);
    const lines = p.lines.map((l, i) => {
      const prod = o.products.find((x) => x.id === l.itemId);
      if (!prod) { e[`lines.${i}.itemId`] = 'Choose an active product'; return null; }
      const rate = l.rate ?? tierRate(prod, factor);
      const a = wsAmounts(o, { itemId: l.itemId, qtyCtn: Number(l.qtyCtn ?? 0), qtyLoose: Number(l.qtyLoose ?? 0), rate: Number(rate), taxRate: prod.taxRate });
      return { lineNo: i + 1, itemId: l.itemId, unitsPerCtn: a.ctn, qtyCtn: Number(l.qtyCtn ?? 0), qtyLoose: Number(l.qtyLoose ?? 0), rate: Number(rate), taxRate: prod.taxRate, grossAmount: a.grossAmount, taxAmount: a.taxAmount, netAmount: a.netAmount };
    });
    if (Object.keys(e).length) throw invalid(e);
    const ls = lines.filter((l): l is NonNullable<typeof l> => !!l);
    const sum = (k: 'grossAmount' | 'taxAmount' | 'netAmount') => Math.round(ls.reduce((s, l) => s + l[k], 0) * 100) / 100;
    return {
      docDate: p.docDate, branchId: route.branchId, bookerEmployeeId, routeId: route.id, customerId: p.customerId, warehouseId, priceTier: shop.priceTier, note: p.note ?? null,
      allowPartial: p.allowPartial ?? true, lineCount: ls.length, grossAmount: sum('grossAmount'), taxAmount: sum('taxAmount'), netAmount: sum('netAmount'), lines: ls,
    };
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const b = await this.get(user, id);
    if (b.rowVersion !== rowVersion) throw new ConcurrencyError('This booking was changed. Reload and try again.');
    return b;
  }
}
