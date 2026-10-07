import type {
  CommissionSlabsResult, Route, RouteOptions, ShopArea, ShopProfile, UnassignedShop, Van, VanWarehouse,
} from "@/shared/distribution";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });

/** Browser clients for Phase 14 distribution setup (/api/distribution/*). */
export const listRoutes = () => apiRequest<Route[]>("/distribution/routes");
export const routeOptions = () => apiRequest<RouteOptions>("/distribution/routes/options");
export const createRoute = (body: Body) => apiRequest<Route>("/distribution/routes", { method: "POST", body });
export const updateRoute = (id: string, body: Body & Version) => apiRequest<Route>(`/distribution/routes/${id}`, { method: "PATCH", body });
export const setRouteActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<Route>(`/distribution/routes/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteRoute = (id: string, rowVersion: number) => del(`/distribution/routes/${id}`, rowVersion);
export const saveRouteStops = (id: string, body: { rowVersion: number; stops: { customerId: string; weekday: string | null; plannedEta: string | null }[] }) =>
  apiRequest<Route>(`/distribution/routes/${id}/stops`, { method: "PUT", body });
export const assignRoute = (id: string, body: Body & Version) => apiRequest<Route>(`/distribution/routes/${id}/assignment`, { method: "PUT", body });

export const listShopProfiles = () => apiRequest<ShopProfile[]>("/distribution/shop-profiles");
export const listUnassignedShops = (search?: string) =>
  apiRequest<UnassignedShop[]>(`/distribution/shop-profiles/unassigned${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const saveShopProfile = (customerId: string, body: Body) => apiRequest<ShopProfile>(`/distribution/shop-profiles/${customerId}`, { method: "PUT", body });
export const removeShopProfile = (customerId: string, rowVersion: number) => del(`/distribution/shop-profiles/${customerId}`, rowVersion);

export const listShopAreas = () => apiRequest<ShopArea[]>("/distribution/shop-areas");
export const createShopArea = (body: Body) => apiRequest<ShopArea>("/distribution/shop-areas", { method: "POST", body });
export const updateShopArea = (id: string, body: Body & Version) => apiRequest<ShopArea>(`/distribution/shop-areas/${id}`, { method: "PATCH", body });
export const setShopAreaActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<ShopArea>(`/distribution/shop-areas/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteShopArea = (id: string, rowVersion: number) => del(`/distribution/shop-areas/${id}`, rowVersion);

export const listVans = () => apiRequest<Van[]>("/distribution/vans");
export const listVanWarehouses = () => apiRequest<VanWarehouse[]>("/distribution/vans/warehouses");
export const createVan = (body: Body) => apiRequest<Van>("/distribution/vans", { method: "POST", body });
export const updateVan = (id: string, body: Body & Version) => apiRequest<Van>(`/distribution/vans/${id}`, { method: "PATCH", body });
export const setVanStatus = (id: string, status: string, rowVersion: number) => apiRequest<Van>(`/distribution/vans/${id}/status`, { method: "POST", body: { status, rowVersion } });
export const deleteVan = (id: string, rowVersion: number) => del(`/distribution/vans/${id}`, rowVersion);
/** "Create van stock location": a VAN-type warehouse made for the van and linked to it. */
export const createVanStockLocation = (id: string, rowVersion: number) => apiRequest<Van>(`/distribution/vans/${id}/stock-location`, { method: "POST", body: { rowVersion } });

export const listCommissionSlabs = (asOf?: string) => apiRequest<CommissionSlabsResult>(`/distribution/commission-slabs${asOf ? `?asOf=${asOf}` : ""}`);
export const saveCommissionSlabs = (body: Body) => apiRequest<CommissionSlabsResult>("/distribution/commission-slabs", { method: "PUT", body });
export const deleteCommissionSlab = (id: string, rowVersion: number) => del(`/distribution/commission-slabs/${id}`, rowVersion);
