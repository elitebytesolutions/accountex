import type { Route, RouteOptions, ShopProfile, UnassignedShop } from '../../../../../shared/distribution/index.js';

export type StaffLookup = (ids: string[]) => Promise<{ id: string; code: string; name: string }[]>;
export type StopRow = { id: string; customerId: string; routeDayId: string | null; weekday: string | null; stopSeq: number };

export abstract class RouteStore {
  /** Live routes with days, stops (visit order) and shop counts. */
  abstract list(tenantId: string, staff: StaffLookup): Promise<Route[]>;
  abstract visitDays(tenantId: string, routeId: string): Promise<{ id: string; weekday: string }[]>;
  abstract stops(tenantId: string, routeId: string): Promise<StopRow[]>;
  abstract options(tenantId: string): Promise<Omit<RouteOptions, 'staff'>>;
  /** A live warehouse / van by id (null when missing or deleted). */
  abstract warehouseExists(tenantId: string, id: string): Promise<boolean>;
  abstract vanExists(tenantId: string, id: string): Promise<boolean>;
  /** Routes.save goes through Distribution.routeAddUpdate (header, visitDays[] and stops[] synced). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;

  // ---- shop profiles (one route per shop)
  abstract profiles(tenantId: string): Promise<ShopProfile[]>;
  abstract unassigned(tenantId: string, search: string | undefined): Promise<UnassignedShop[]>;
  abstract customerExists(tenantId: string, id: string): Promise<boolean>;
  abstract areaExists(tenantId: string, id: string): Promise<boolean>;
  abstract tierExists(tenantId: string, code: string): Promise<boolean>;
  abstract profileIdOf(tenantId: string, customerId: string): Promise<string | null>;
  abstract saveProfile(data: Record<string, unknown>): Promise<string>;
  /** Removes a shop's stops on a route (inside the unit of work). */
  abstract deleteStopsOf(tenantId: string, customerId: string, routeId: string): Promise<void>;
  /** Appends the shop as an every-visit-day stop at the end of the route. */
  abstract appendStop(tenantId: string, routeId: string, customerId: string, stopSeq: number): Promise<void>;
  abstract deleteProfile(tenantId: string, customerId: string, rowVersion: number): Promise<void>;
}
