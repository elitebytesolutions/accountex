import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../../../../../shared/index.js';
import {
  ROUTE_SEATS, SEAT_ROLE, weekdayLabel,
  type Route, type RouteAssignment, type RouteCreate, type RouteOptions, type RouteSeat, type RouteStopsSave, type RouteUpdate, type ShopProfileSave,
} from '../../../../../shared/distribution/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { nextSeq, planDays, planStops, TEMP_SEQ_BASE } from '../domain/route-plan.js';
import { RouteStore } from './route-store.js';
import { StaffDirectory } from './staff-directory.js';

const SEAT_FIELD: Record<RouteSeat, 'bookerEmployeeId' | 'salesmanEmployeeId' | 'driverEmployeeId' | 'supervisorEmployeeId'> = {
  booker: 'bookerEmployeeId', salesman: 'salesmanEmployeeId', driver: 'driverEmployeeId', supervisor: 'supervisorEmployeeId',
};
const ROLE_LABEL: Record<string, string> = { ORDER_BOOKER: 'Order Booker', SALESMAN: 'Salesman', DELIVERYMAN: 'Deliveryman' };

/**
 * Routes & Salesmen: route header and visit days, the ordered stop list, staff and van assignment, and the shop board
 * (Distribution.ShopRouteProfiles: one route per shop). routeAddUpdate syncs visitDays[] and stops[] (rows left out
 * are deleted), so: visit days are saved before stops, a day that still has stops can't go (409 ROUTE_DAY_HAS_STOPS),
 * and stops are reordered through temporary sequence numbers so the unique (route, day, seq) index never clashes.
 */
@Injectable()
export class RoutesService {
  constructor(
    private readonly store: RouteStore,
    private readonly staff: StaffDirectory,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser) {
    return this.store.list(user.tenantId, (ids) => this.staff.byIds(user.tenantId, ids));
  }

  /** Selects for the route sheet and assignment panel: warehouses, vans, price tiers and employees per seat role. */
  async options(user: SessionUser): Promise<RouteOptions> {
    const [base, members] = await Promise.all([this.store.options(user.tenantId), this.staff.members(user.tenantId)]);
    const pick = (seat: RouteSeat) => members.filter((m) => !SEAT_ROLE[seat] || m.roles.includes(SEAT_ROLE[seat]!)).map(({ id, code, name }) => ({ id, code, name }));
    return { ...base, staff: { booker: pick('booker'), salesman: pick('salesman'), driver: pick('driver'), supervisor: pick('supervisor') } };
  }

  async create(user: SessionUser, meta: RequestMeta, input: RouteCreate): Promise<Route> {
    if (!input.days.length) throw this.noDay();
    const { days, ...header } = input;
    await this.checkRefs(user, header);
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      // No code: routeAddUpdate numbers the route from the company's RT series (RT-01, RT-02 …).
      this.store.save({ ...header, status: 'ACTIVE', visitDays: days.map((weekday) => ({ weekday })) }));
    return this.get(user, id);
  }

  /** Header and visit days. Days are synced on their own call; stops are never touched here. */
  async update(user: SessionUser, meta: RequestMeta, id: string, input: RouteUpdate): Promise<Route> {
    const r = await this.current(user, id, input.rowVersion);
    const { days, rowVersion, ...header } = input;
    await this.checkRefs(user, header);
    let visitDays: { id?: string; weekday?: string }[] | undefined;
    if (days) {
      if (!days.length) throw this.noDay();
      const plan = planDays(await this.store.visitDays(user.tenantId, id), days);
      const blocked = plan.removed.filter((d) => r.stops.some((s) => s.weekday === d.weekday));
      if (blocked.length) {
        const names = blocked.map((d) => weekdayLabel(d.weekday)).join(', ');
        throw new ConflictError(`Stops are planned on ${names}. Move or remove them before dropping the day.`, { days: [`${names} still has stops`] }, { code: 'ROUTE_DAY_HAS_STOPS' });
      }
      visitDays = [...plan.keep.map((d) => ({ id: d.id })), ...plan.add.map((weekday) => ({ weekday }))];
    }
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...header, id, rowVersion, ...(visitDays && { visitDays }) }));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<Route> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  /** Soft delete, only while no shop, booking, load sheet, invoice or target uses the route. */
  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Shops, bookings, load sheets or invoices use this route. Deactivate it instead.', undefined, { code: 'ROUTE_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  /** Booker, salesman, driver, supervisor and van. Each employee must hold the seat's role (supervisors need none). */
  async assign(user: SessionUser, meta: RequestMeta, id: string, input: RouteAssignment): Promise<Route> {
    await this.current(user, id, input.rowVersion);
    await this.checkRefs(user, input);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ ...input, id }));
    return this.get(user, id);
  }

  /** Replaces the ordered stop list. Pass 1 moves kept stops to temporary numbers (and drops the rest); pass 2 writes the final order. */
  async saveStops(user: SessionUser, meta: RequestMeta, id: string, input: RouteStopsSave): Promise<Route> {
    const r = await this.current(user, id, input.rowVersion);
    const onRoute = new Set((await this.store.profiles(user.tenantId)).filter((p) => p.routeId === id).map((p) => p.customerId));
    const stranger = input.stops.find((s) => !onRoute.has(s.customerId));
    if (stranger) throw new ValidationError('Only shops assigned to this route can be stops on it.', { stops: ['Move the shop onto the route first'] }, { code: 'ROUTE_SHOP_NOT_ASSIGNED' });
    const dayRows = await this.store.visitDays(user.tenantId, id);
    const badDay = input.stops.find((s) => s.weekday && !dayRows.some((d) => d.weekday === s.weekday));
    if (badDay) throw new ValidationError(`${r.code} doesn't visit on ${weekdayLabel(badDay.weekday!)}.`, { stops: ['Not a visit day of this route'] });
    const plan = planStops(input.stops, await this.store.stops(user.tenantId, id));
    if (plan.error) throw new ValidationError(plan.error, { stops: [plan.error] });
    const dayId = (w: string | null) => (w ? dayRows.find((d) => d.weekday === w)!.id : null);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.save({ id, rowVersion: input.rowVersion, stops: plan.kept.map((s, i) => ({ id: s.id, stopSeq: TEMP_SEQ_BASE + i })) });
      await this.store.save({
        id,
        stops: plan.stops.map((s) => ({ ...(s.id && { id: s.id }), customerId: s.customerId, routeDayId: dayId(s.weekday), stopSeq: s.stopSeq, plannedEta: s.plannedEta })),
      });
    });
    return this.get(user, id);
  }

  // ---------------------------------------------------------------- shop board
  profiles(user: SessionUser) {
    return this.store.profiles(user.tenantId);
  }

  unassigned(user: SessionUser, search: string | undefined) {
    return this.store.unassigned(user.tenantId, search);
  }

  /**
   * Puts a shop on a route (a shop is on exactly one route). Moving it drops its stops on the old route first (they
   * reference the shop's profile), then adds it as the last every-visit-day stop on the new one.
   */
  async saveProfile(user: SessionUser, meta: RequestMeta, customerId: string, input: ShopProfileSave) {
    const t = user.tenantId;
    if (!(await this.store.customerExists(t, customerId))) throw new NotFoundError('Customer not found');
    const route = (await this.list(user)).find((r) => r.id === input.routeId);
    if (!route) throw new ValidationError('Choose a route', { routeId: ['Unknown route'] });
    if (route.status !== 'ACTIVE') throw new ValidationError(`${route.code} is inactive. Activate it first.`, { routeId: ['Inactive route'] });
    if (input.areaId && !(await this.store.areaExists(t, input.areaId))) throw new ValidationError('Choose an area', { areaId: ['Unknown area'] });
    if (input.priceTier && !(await this.store.tierExists(t, input.priceTier))) throw new ValidationError('Choose a price tier', { priceTier: ['Unknown or inactive tier'] });
    const existing = (await this.store.profiles(t)).find((p) => p.customerId === customerId);
    if (existing && input.rowVersion !== undefined && existing.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else moved this shop. Reload and try again.');
    const moving = !existing || existing.routeId !== input.routeId;
    const fields = { routeId: input.routeId, areaId: input.areaId, visitSeq: input.visitSeq, priceTier: input.priceTier };
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (existing && moving) await this.store.deleteStopsOf(t, customerId, existing.routeId);
      await this.store.saveProfile(existing ? { ...fields, id: (await this.profileId(t, customerId))!, rowVersion: existing.rowVersion } : { ...fields, customerId });
      if (moving) await this.store.appendStop(t, input.routeId, customerId, nextSeq(route.stops, null));
    });
    return (await this.store.profiles(t)).find((p) => p.customerId === customerId)!;
  }

  /** Takes a shop off its route (its stops go with it). */
  async removeProfile(user: SessionUser, meta: RequestMeta, customerId: string, rowVersion: number): Promise<void> {
    const t = user.tenantId;
    const existing = (await this.store.profiles(t)).find((p) => p.customerId === customerId);
    if (!existing) throw new NotFoundError('This shop is not on a route');
    if (existing.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else moved this shop. Reload and try again.');
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.deleteStopsOf(t, customerId, existing.routeId);
      await this.store.deleteProfile(t, customerId, rowVersion);
    });
  }

  // ---------------------------------------------------------------- helpers
  private async profileId(tenantId: string, customerId: string) {
    return this.store.profileIdOf(tenantId, customerId);
  }

  private noDay() {
    return new ValidationError('A route needs at least one visit day.', { days: ['Pick at least one visit day'] }, { code: 'ROUTE_NO_VISIT_DAY' });
  }

  /** Warehouse and van exist; each staff seat holds the matching role. */
  private async checkRefs(user: SessionUser, v: Partial<Record<'sourceWarehouseId' | 'vehicleId' | (typeof SEAT_FIELD)[RouteSeat], string | null>>) {
    const t = user.tenantId;
    if (v.sourceWarehouseId && !(await this.store.warehouseExists(t, v.sourceWarehouseId))) throw new ValidationError('Choose a warehouse', { sourceWarehouseId: ['Unknown warehouse'] });
    if (v.vehicleId && !(await this.store.vanExists(t, v.vehicleId))) throw new ValidationError('Choose a van', { vehicleId: ['Unknown van'] });
    const seats = ROUTE_SEATS.filter((s) => v[SEAT_FIELD[s]]);
    if (!seats.length) return;
    const people = await this.staff.byIds(t, seats.map((s) => v[SEAT_FIELD[s]]!));
    for (const seat of seats) {
      const field = SEAT_FIELD[seat], e = people.find((p) => p.id === v[field]);
      if (!e) throw new ValidationError('Choose an employee', { [field]: ['Unknown employee'] });
      const role = SEAT_ROLE[seat];
      if (role && !e.roles.includes(role)) throw new ConflictError(`${e.name} doesn't hold the ${ROLE_LABEL[role]} role.`, { [field]: [`Needs the ${ROLE_LABEL[role]} role`] }, { code: 'ROUTE_STAFF_ROLE_MISMATCH' });
    }
  }

  private async get(user: SessionUser, id: string) {
    const r = (await this.list(user)).find((x) => x.id === id);
    if (!r) throw new NotFoundError('Route not found');
    return r;
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const r = await this.get(user, id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this route. Reload and try again.');
    return r;
  }
}
