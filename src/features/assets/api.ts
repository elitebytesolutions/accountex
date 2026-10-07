import type { AssetCategory, AssetCategoryCreateFields } from "@/shared";
import { apiRequest } from "@/lib/api/client";

/** Browser clients for Fixed Assets › Asset Categories. */
export const listAssetCategories = () => apiRequest<AssetCategory[]>("/assets/categories");
export const createAssetCategory = (body: AssetCategoryCreateFields) => apiRequest<AssetCategory>("/assets/categories", { method: "POST", body });
export const updateAssetCategory = (id: string, body: Partial<AssetCategoryCreateFields> & { rowVersion: number }) =>
  apiRequest<AssetCategory>(`/assets/categories/${id}`, { method: "PATCH", body });
export const setAssetCategoryActive = (id: string, on: boolean, rowVersion: number) =>
  apiRequest<AssetCategory>(`/assets/categories/${id}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });
export const deleteAssetCategory = (id: string, rowVersion: number) => apiRequest<void>(`/assets/categories/${id}?rowVersion=${rowVersion}`, { method: "DELETE" });
