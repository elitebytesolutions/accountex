import { Injectable } from '@nestjs/common';
import type { Route, RouteOptions, ShopProfile, UnassignedShop, Weekday } from '../../../../../shared/distribution/index.js';
import { ConcurrencyError, ConflictError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { RouteStore, type StaffLookup, type StopRow } from '../application/route-store.js';

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const byDay = (a: string, b: string) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b);
/** Prisma maps `time` to a Date on 1970-01-01 (UTC). */
const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
/** A visit day removed while stops still point at it (FK routeStopRouteDayIdFk), as surfaced by Prisma's driver adapter. */
const isDayWithStops = (e: unknown) => {
  const c = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } })?.meta?.driverAdapterError?.cause;
  return c?.originalCode === '23503' && !!c.originalMessage?.includes('routeStopRouteDayIdFk');
};

@Injectable()
export class PrismaRouteStore extends RouteStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, staff: StaffLookup): Promise<Route[]> {
    const db = this.prisma.db();
    const routes = await db.routes.findMany({ where: { tenantId, deletedAt: null }, orderBy: { code: 'asc' } });
    if (!routes.length) return [];
    const ids = routes.map((r) => r.id);
    const [days, stops, profiles, whs, vans] = await Promise.all([
      db.routeVisitDays.findMany({ where: { tenantId, routeId: { in: ids } } }),
      db.routeStops.findMany({ where: { tenantId, routeId: { in: ids } }, orderBy: { stopSeq: 'asc' } }),
      db.shopRouteProfiles.findMany({ where: { tenantId, routeId: { in: ids } }, select: { customerId: true, routeId: true, areaId: true, priceTier: true } }),
      db.warehouses.findMany({ where: { tenantId, id: { in: routes.map((r) => r.sourceWarehouseId).filter((x): x is string => !!x) } }, select: { id: true, code: true, name: true } }),
      db.vans.findMany({ where: { tenantId, id: { in: routes.map((r) => r.vehicleId).filter((x): x is string => !!x) } }, select: { id: true, regNo: true, model: true } }),
    ]);
    const custIds = [...new Set(stops.map((s) => s.customerId))];
    const [customers, areas, people] = await Promise.all([
      db.customers.findMany({ where: { tenantId, id: { in: custIds } }, select: { id: true, code: true, name: true, area: true } }),
      db.shopAreas.findMany({ where: { tenantId, id: { in: profiles.map((p) => p.areaId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      staff([...new Set(routes.flatMap((r) => [r.bookerEmployeeId, r.salesmanEmployeeId, r.driverEmployeeId, r.supervisorEmployeeId]).filter((x): x is string => !!x))]),
    ]);
    const person = (id: string | null) => (id ? people.find((p) => p.id === id) ?? { id, code: '', name: 'Unknown employee' } : null);
    return routes.map((r) => {
      const rDays = days.filter((d) => d.routeId === r.id);
      const dayOf = (id: string | null) => (id ? (rDays.find((d) => d.id === id)?.weekday ?? null) : null);
      const rStops = stops.filter((s) => s.routeId === r.id)
        .map((s) => ({ s, weekday: dayOf(s.routeDayId) }))
        .sort((a, b) => (a.weekday === b.weekday ? a.s.stopSeq - b.s.stopSeq : a.weekday === null ? -1 : b.weekday === null ? 1 : byDay(a.weekday, b.weekday)));
      return {
        id: r.id, code: r.code, name: r.name, branchId: r.branchId, status: r.status,
        sourceWarehouse: whs.find((w) => w.id === r.sourceWarehouseId) ?? null,
        van: vans.find((v) => v.id === r.vehicleId) ?? null,
        booker: person(r.bookerEmployeeId), salesman: person(r.salesmanEmployeeId), driver: person(r.driverEmployeeId), supervisor: person(r.supervisorEmployeeId),
        days: rDays.map((d) => d.weekday).sort(byDay) as Weekday[],
        stops: rStops.map(({ s, weekday }) => {
          const c = customers.find((x) => x.id === s.customerId);
          const p = profiles.find((x) => x.customerId === s.customerId);
          return {
            id: s.id, customerId: s.customerId, code: c?.code ?? '', name: c?.name ?? 'Unknown shop',
            area: areas.find((a) => a.id === p?.areaId)?.name ?? c?.area ?? null, priceTier: p?.priceTier ?? 'RETAILER',
            weekday: weekday as Weekday | null, stopSeq: s.stopSeq, plannedEta: hhmm(s.plannedEta),
          };
        }),
        shops: profiles.filter((p) => p.routeId === r.id).length,
        rowVersion: r.rowVersion,
      };
    });
  }

  visitDays(tenantId: string, routeId: string) {
    return this.prisma.db().routeVisitDays.findMany({ where: { tenantId, routeId }, select: { id: true, weekday: true } });
  }

  async stops(tenantId: string, routeId: string): Promise<StopRow[]> {
    const db = this.prisma.db();
    const [stops, days] = await Promise.all([
      db.routeStops.findMany({ where: { tenantId, routeId }, select: { id: true, customerId: true, routeDayId: true, stopSeq: true } }),
      db.routeVisitDays.findMany({ where: { tenantId, routeId }, select: { id: true, weekday: true } }),
    ]);
    return stops.map((s) => ({ ...s, weekday: s.routeDayId ? (days.find((d) => d.id === s.routeDayId)?.weekday ?? null) : null }));
  }

  async options(tenantId: string): Promise<Omit<RouteOptions, 'staff'>> {
    const db = this.prisma.db();
    const [warehouses, vans, tiers] = await Promise.all([
      db.warehouses.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, type: true }, orderBy: { code: 'asc' } }),
      db.vans.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, regNo: true, model: true, status: true }, orderBy: { regNo: 'asc' } }),
      db.priceTiers.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { code: true, name: true }, orderBy: { rateFactor: 'desc' } }),
    ]);
    return { warehouses, vans, priceTiers: tiers };
  }

  async warehouseExists(tenantId: string, id: string) {
    return !!(await this.prisma.db().warehouses.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true } }));
  }

  async vanExists(tenantId: string, id: string) {
    return !!(await this.prisma.db().vans.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true } }));
  }

  async save(data: Record<string, unknown>) {
    try {
      return await addUpdate(this.prisma, 'routeAddUpdate', data);
    } catch (e) {
      // The service checks first; this covers a stop added by someone else in the meantime.
      if (isDayWithStops(e)) throw new ConflictError('Stops are planned on a visit day being removed. Move or remove them first.', { days: ['That day still has stops'] }, { code: 'ROUTE_DAY_HAS_STOPS' });
      throw e;
    }
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'routes', id, ['routeVisitDays', 'routeStops']);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().routes.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this route. Reload and try again.');
  }

  async profiles(tenantId: string): Promise<ShopProfile[]> {
    const db = this.prisma.db();
    const rows = await db.shopRouteProfiles.findMany({ where: { tenantId }, orderBy: [{ visitSeq: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] });
    if (!rows.length) return [];
    const [customers, areas] = await Promise.all([
      db.customers.findMany({ where: { tenantId, id: { in: rows.map((r) => r.customerId) } }, select: { id: true, code: true, name: true, city: true, area: true } }),
      db.shopAreas.findMany({ where: { tenantId, id: { in: rows.map((r) => r.areaId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    ]);
    return rows.map((r) => {
      const c = customers.find((x) => x.id === r.customerId);
      return {
        id: r.id, customerId: r.customerId, code: c?.code ?? '', name: c?.name ?? 'Unknown shop', city: c?.city ?? null, customerArea: c?.area ?? null,
        routeId: r.routeId, areaId: r.areaId, areaName: areas.find((a) => a.id === r.areaId)?.name ?? null,
        priceTier: r.priceTier, visitSeq: r.visitSeq, isActive: r.isActive, rowVersion: r.rowVersion,
      };
    });
  }

  async unassigned(tenantId: string, search: string | undefined): Promise<UnassignedShop[]> {
    const db = this.prisma.db();
    const taken = (await db.shopRouteProfiles.findMany({ where: { tenantId }, select: { customerId: true } })).map((p) => p.customerId);
    const q = search?.trim();
    const rows = await db.customers.findMany({
      where: {
        tenantId, deletedAt: null, status: { not: 'INACTIVE' }, id: { notIn: taken },
        ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { area: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] }),
      },
      select: { id: true, code: true, name: true, city: true, area: true }, orderBy: { name: 'asc' }, take: 50,
    });
    return rows.map((c) => ({ customerId: c.id, code: c.code, name: c.name, city: c.city, customerArea: c.area }));
  }

  async customerExists(tenantId: string, id: string) {
    return !!(await this.prisma.db().customers.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true } }));
  }

  async areaExists(tenantId: string, id: string) {
    return !!(await this.prisma.db().shopAreas.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true } }));
  }

  async tierExists(tenantId: string, code: string) {
    return !!(await this.prisma.db().priceTiers.findFirst({ where: { tenantId, code, deletedAt: null, isActive: true }, select: { id: true } }));
  }

  async profileIdOf(tenantId: string, customerId: string) {
    return (await this.prisma.db().shopRouteProfiles.findFirst({ where: { tenantId, customerId }, select: { id: true } }))?.id ?? null;
  }

  saveProfile(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'shopRouteProfileAddUpdate', data);
  }

  async deleteStopsOf(tenantId: string, customerId: string, routeId: string) {
    await this.prisma.db().routeStops.deleteMany({ where: { tenantId, customerId, routeId } });
  }

  async appendStop(tenantId: string, routeId: string, customerId: string, stopSeq: number) {
    await this.prisma.db().routeStops.create({ data: { tenantId, routeId, customerId, routeDayId: null, stopSeq } });
  }

  async deleteProfile(tenantId: string, customerId: string, rowVersion: number) {
    const { count } = await this.prisma.db().shopRouteProfiles.deleteMany({ where: { tenantId, customerId, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this shop. Reload and try again.');
  }
}
