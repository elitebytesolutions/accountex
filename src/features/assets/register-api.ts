import type {
  AssetDetail, AssetDisposal, AssetDisposalList, AssetOptions, AssetScheduleRow, AssetTransfer, CapitalisableLine, DepreciationRun, DepreciationRunList, FixedAssetList,
} from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Q = Record<string, string | number | boolean | null | undefined>;
const qs = (q: Q) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const post = <T,>(path: string, body?: Body) => apiRequest<T>(path, { method: "POST", body });
const patch = <T,>(path: string, body: Body) => apiRequest<T>(path, { method: "PATCH", body });
const del = (path: string, rv: number) => apiRequest<void>(`${path}?rowVersion=${rv}`, { method: "DELETE" });

/** Browser clients for Phase 27 fixed assets (register, depreciation, transfers, disposals). */
export const assetOptions = () => apiRequest<AssetOptions>("/assets/options");
export const capitalisableLines = (search?: string) => apiRequest<CapitalisableLine[]>(`/assets/capitalisable-lines${qs({ search })}`);

// register
export const listAssets = (q: Q) => apiRequest<FixedAssetList>(`/assets${qs(q)}`);
export const getAsset = (id: string) => apiRequest<AssetDetail>(`/assets/${id}`);
export const assetSchedule = (id: string) => apiRequest<AssetScheduleRow[]>(`/assets/${id}/schedule`);
export const createAsset = (body: Body) => post<AssetDetail>("/assets", body);
export const updateAsset = (id: string, body: Body) => patch<AssetDetail>(`/assets/${id}`, body);
export const deleteAsset = (id: string, rv: number) => del(`/assets/${id}`, rv);
/** NEW → in use; from a posted bill line (reclass journal when needed) or as an existing asset (billLineId null). */
export const capitaliseAsset = (id: string, rv: number, billLineId?: string | null) => post<AssetDetail>(`/assets/${id}/capitalise`, { rowVersion: rv, billLineId: billLineId ?? null });

// transfers
export const requestTransfer = (assetId: string, body: Body) => post<AssetTransfer>(`/assets/${assetId}/transfer`, body);
export const listTransfers = (q: { asset?: string; status?: string }) => apiRequest<AssetTransfer[]>(`/assets/transfers${qs(q)}`);
export const approveTransfer = (id: string) => post<AssetTransfer>(`/assets/transfers/${id}/approve`);
export const rejectTransfer = (id: string, reason?: string) => post<AssetTransfer>(`/assets/transfers/${id}/reject`, { reason });
export const cancelTransfer = (id: string, reason?: string) => post<AssetTransfer>(`/assets/transfers/${id}/cancel`, { reason });

// disposals
export const listDisposals = (q: Q) => apiRequest<AssetDisposalList>(`/assets/disposals${qs(q)}`);
export const getDisposal = (id: string) => apiRequest<AssetDisposal>(`/assets/disposals/${id}`);
export const createDisposal = (body: Body) => post<AssetDisposal>("/assets/disposals", body);
export const updateDisposal = (id: string, body: Body) => patch<AssetDisposal>(`/assets/disposals/${id}`, body);
export const deleteDisposal = (id: string, rv: number) => del(`/assets/disposals/${id}`, rv);
export const submitDisposal = (id: string, rv: number) => post<AssetDisposal>(`/assets/disposals/${id}/submit`, { rowVersion: rv });
/** Approve and post (gain / loss journal); someone other than the preparer. */
export const approveDisposal = (id: string) => post<AssetDisposal>(`/assets/disposals/${id}/approve`);
export const cancelDisposal = (id: string, rv: number, reason: string) => post<AssetDisposal>(`/assets/disposals/${id}/cancel`, { rowVersion: rv, reason });

// depreciation runs
export const listRuns = (q: Q) => apiRequest<DepreciationRunList>(`/assets/depreciation-runs${qs(q)}`);
export const getRun = (id: string) => apiRequest<DepreciationRun>(`/assets/depreciation-runs/${id}`);
/** Creates and computes the period's draft run (409 DEPRECIATION_PERIOD_HAS_RUN with details.runId when one exists). */
export const previewRun = (body: { fiscalPeriodId: string; postingDate: string; branchId?: string | null; categoryId?: string | null }) => post<DepreciationRun>("/assets/depreciation-runs/preview", body);
export const recomputeRun = (id: string, rv: number) => post<DepreciationRun>(`/assets/depreciation-runs/${id}/recompute`, { rowVersion: rv });
export const postRun = (id: string, rv: number) => post<DepreciationRun>(`/assets/depreciation-runs/${id}/post`, { rowVersion: rv });
export const reverseRun = (id: string, rv: number, reason: string) => post<DepreciationRun>(`/assets/depreciation-runs/${id}/reverse`, { rowVersion: rv, reason });
export const deleteRun = (id: string, rv: number) => del(`/assets/depreciation-runs/${id}`, rv);
