import type {
  Addon, AddonPlanInput, Coupon, CouponRedemption, ModulePlanInput, PartnerOption, PlanFeatureInput, PlanLimitInput, PlanSaveResult,
  PlatformModule, SubscriptionPlan, UsageMeterOption,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser-side Super Admin catalogue calls (Phase 36): /api/admin/{plans,modules,addons,coupons}. */
type Body = Record<string, unknown>;

// plans
export const listPlans = () => apiRequest<SubscriptionPlan[]>("/admin/plans");
export const listUsageMeters = () => apiRequest<UsageMeterOption[]>("/admin/plans/usage-meters");
export const planVersions = (id: string) => apiRequest<SubscriptionPlan[]>(`/admin/plans/${id}/versions`);
export const createPlan = (body: Body) => apiRequest<SubscriptionPlan>("/admin/plans", { method: "POST", body });
export const updatePlan = (id: string, body: Body) => apiRequest<PlanSaveResult>(`/admin/plans/${id}`, { method: "PATCH", body });
export const setPlanFeatures = (id: string, rowVersion: number, features: PlanFeatureInput[]) =>
  apiRequest<SubscriptionPlan>(`/admin/plans/${id}/features`, { method: "PUT", body: { rowVersion, features } });
export const setPlanLimits = (id: string, rowVersion: number, limits: PlanLimitInput[]) =>
  apiRequest<SubscriptionPlan>(`/admin/plans/${id}/limits`, { method: "PUT", body: { rowVersion, limits } });
export const setPlanStatus = (id: string, action: "retire" | "reactivate", rowVersion: number) =>
  apiRequest<SubscriptionPlan>(`/admin/plans/${id}/${action}`, { method: "POST", body: { rowVersion } });
export const deletePlan = (id: string, rowVersion: number) => apiRequest<void>(`/admin/plans/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// modules
export const listModules = () => apiRequest<PlatformModule[]>("/admin/modules");
export const createModule = (body: Body) => apiRequest<PlatformModule>("/admin/modules", { method: "POST", body });
export const updateModule = (id: string, body: Body) => apiRequest<PlatformModule>(`/admin/modules/${id}`, { method: "PATCH", body });
export const setModulePlans = (id: string, rowVersion: number, plans: ModulePlanInput[]) =>
  apiRequest<PlatformModule>(`/admin/modules/${id}/plans`, { method: "PUT", body: { rowVersion, plans } });
export const setModuleEnabled = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<PlatformModule>(`/admin/modules/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteModule = (id: string, rowVersion: number) => apiRequest<void>(`/admin/modules/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// add-ons
export const listAddons = () => apiRequest<Addon[]>("/admin/addons");
export const createAddon = (body: Body) => apiRequest<Addon>("/admin/addons", { method: "POST", body });
export const updateAddon = (id: string, body: Body) => apiRequest<Addon>(`/admin/addons/${id}`, { method: "PATCH", body });
export const setAddonPlans = (id: string, rowVersion: number, plans: AddonPlanInput[]) =>
  apiRequest<Addon>(`/admin/addons/${id}/plans`, { method: "PUT", body: { rowVersion, plans } });
export const setAddonActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<Addon>(`/admin/addons/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteAddon = (id: string, rowVersion: number) => apiRequest<void>(`/admin/addons/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });

// coupons
export const listCoupons = () => apiRequest<Coupon[]>("/admin/coupons");
export const listPartnerOptions = () => apiRequest<PartnerOption[]>("/admin/coupons/partners");
export const couponRedemptions = (id: string) => apiRequest<CouponRedemption[]>(`/admin/coupons/${id}/redemptions`);
export const createCoupon = (body: Body) => apiRequest<Coupon>("/admin/coupons", { method: "POST", body });
export const updateCoupon = (id: string, body: Body) => apiRequest<Coupon>(`/admin/coupons/${id}`, { method: "PATCH", body });
export const setCouponPaused = (id: string, paused: boolean, rowVersion: number) =>
  apiRequest<Coupon>(`/admin/coupons/${id}/${paused ? "pause" : "resume"}`, { method: "POST", body: { rowVersion } });
export const deleteCoupon = (id: string, rowVersion: number) => apiRequest<void>(`/admin/coupons/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
