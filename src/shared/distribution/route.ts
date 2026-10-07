import { z } from 'zod';
import { RowVersionSchema } from '../common/list-query.ts';

/** Visit days, Monday first (lookup RouteVisitDayWeekday). */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;
export const weekdayLabel = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/** Route seats and the system role each needs (Employees.appUserId → UserRoles → Roles.systemKey); supervisors need none. */
export const ROUTE_SEATS = ['booker', 'salesman', 'driver', 'supervisor'] as const;
export type RouteSeat = (typeof ROUTE_SEATS)[number];
export const SEAT_ROLE: Record<RouteSeat, string | null> = { booker: 'ORDER_BOOKER', salesman: 'SALESMAN', driver: 'DELIVERYMAN', supervisor: null };

const Ref = z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable();

/** A stop in visit order. `weekday` null = every visit day of the route. */
export const RouteStopSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  code: z.string(),
  name: z.string(),
  area: z.string().nullable(),
  priceTier: z.string(),
  weekday: WeekdaySchema.nullable(),
  stopSeq: z.number().int(),
  plannedEta: z.string().nullable(),
});
export type RouteStop = z.infer<typeof RouteStopSchema>;

/** A route (Distribution.Routes) with its visit days, stops and staff. Staff are employees (after Phase 11). */
export const RouteSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  branchId: z.string().nullable(),
  status: z.string(),
  sourceWarehouse: Ref,
  van: z.object({ id: z.string(), regNo: z.string(), model: z.string() }).nullable(),
  booker: Ref,
  salesman: Ref,
  driver: Ref,
  supervisor: Ref,
  days: z.array(WeekdaySchema),
  stops: z.array(RouteStopSchema),
  shops: z.number().int(),
  rowVersion: z.number().int(),
});
export type Route = z.infer<typeof RouteSchema>;

const blankToNull = (v: unknown) => (v === '' ? null : v);
const optId = z.preprocess(blankToNull, z.uuid().nullable()).optional();
const Days = z.array(WeekdaySchema).max(7).refine((d) => new Set(d).size === d.length, 'A day appears twice');

export const RouteCreateSchema = z.object({
  name: z.string().trim().min(2, 'Give the route a name').max(80),
  branchId: optId,
  sourceWarehouseId: optId,
  vehicleId: optId,
  bookerEmployeeId: optId,
  salesmanEmployeeId: optId,
  driverEmployeeId: optId,
  supervisorEmployeeId: optId,
  /** At least one (checked by the service: 400 ROUTE_NO_VISIT_DAY). */
  days: Days,
});
export type RouteCreate = z.infer<typeof RouteCreateSchema>;

export const RouteUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Give the route a name').max(80).optional(),
  branchId: optId,
  sourceWarehouseId: optId,
  days: Days.optional(),
}).extend(RowVersionSchema.shape);
export type RouteUpdate = z.infer<typeof RouteUpdateSchema>;

/** PUT /routes/:id/assignment: who works the route and with which van (omitted = unchanged, null = cleared). */
export const RouteAssignmentSchema = z.object({
  bookerEmployeeId: optId,
  salesmanEmployeeId: optId,
  driverEmployeeId: optId,
  supervisorEmployeeId: optId,
  vehicleId: optId,
}).extend(RowVersionSchema.shape);
export type RouteAssignment = z.infer<typeof RouteAssignmentSchema>;

/** PUT /routes/:id/stops: the whole ordered stop list; the order within each day (or "every day") is the visit order. */
export const RouteStopsSaveSchema = z.object({
  stops: z.array(z.object({
    customerId: z.uuid(),
    weekday: z.preprocess(blankToNull, WeekdaySchema.nullable()).default(null),
    plannedEta: z.preprocess(blankToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM').nullable()).default(null),
  })).max(500),
}).extend(RowVersionSchema.shape);
export type RouteStopsSave = z.infer<typeof RouteStopsSaveSchema>;

/** A shop on the board: a customer and its route profile (Distribution.ShopRouteProfiles); one route per shop. */
export const ShopProfileSchema = z.object({
  /** The profile row (its history). */
  id: z.string(),
  customerId: z.string(),
  code: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  customerArea: z.string().nullable(),
  routeId: z.string(),
  areaId: z.string().nullable(),
  areaName: z.string().nullable(),
  priceTier: z.string(),
  visitSeq: z.number().int().nullable(),
  isActive: z.boolean(),
  rowVersion: z.number().int(),
});
export type ShopProfile = z.infer<typeof ShopProfileSchema>;

/** A customer not on any route yet. */
export const UnassignedShopSchema = z.object({ customerId: z.string(), code: z.string(), name: z.string(), city: z.string().nullable(), customerArea: z.string().nullable() });
export type UnassignedShop = z.infer<typeof UnassignedShopSchema>;

/** PUT /shop-profiles/:customerId: put the shop on a route (moving it drops its stops on the old one). */
export const ShopProfileSaveSchema = z.object({
  routeId: z.uuid(),
  areaId: z.preprocess(blankToNull, z.uuid().nullable()).optional(),
  visitSeq: z.preprocess(blankToNull, z.coerce.number().int().min(1).max(9999).nullable()).optional(),
  priceTier: z.string().trim().min(2).max(20).optional(),
  /** The profile's version when it exists. */
  rowVersion: z.coerce.number().int().min(0).optional(),
});
export type ShopProfileSave = z.infer<typeof ShopProfileSaveSchema>;

/** Select options for the route sheet and the assignment panel. Staff lists are empty until Phase 11 adds employees. */
export const RouteOptionsSchema = z.object({
  warehouses: z.array(z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.string() })),
  vans: z.array(z.object({ id: z.string(), regNo: z.string(), model: z.string(), status: z.string() })),
  staff: z.object({
    booker: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
    salesman: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
    driver: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
    supervisor: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })),
  }),
  priceTiers: z.array(z.object({ code: z.string(), name: z.string() })),
});
export type RouteOptions = z.infer<typeof RouteOptionsSchema>;
