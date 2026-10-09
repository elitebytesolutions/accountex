import type {
  AssetDisposal, AssetDisposalList, AssetOptions, AssetQuery, AssetTransfer, CapitalisableLine, DepreciationRun, DepreciationRunList, FixedAsset, FixedAssetList,
} from '../../../../../shared/index.js';

export type AssetSave = 'fixedAssetAddUpdate' | 'depreciationRunAddUpdate' | 'assetTransferAddUpdate' | 'assetDisposalAddUpdate';
/** The FixedAssets database functions the register, runs, transfers and disposals move through. */
export type AssetAction =
  | 'depreciationRunCompute' | 'depreciationRunPost' | 'depreciationRunCancel'
  | 'assetTransferApprove' | 'assetTransferComplete' | 'assetTransferReject' | 'assetTransferCancel'
  | 'assetDisposalApprove' | 'assetDisposalCancel';

/** Persistence for the fixed asset register, depreciation runs, transfers and disposals (schema FixedAssets). */
export abstract class FixedAssetStore {
  abstract options(tenantId: string): Promise<AssetOptions>;
  abstract capitalisableLines(tenantId: string, search: string | null): Promise<CapitalisableLine[]>;

  abstract listAssets(tenantId: string, q: AssetQuery): Promise<FixedAssetList>;
  abstract getAsset(tenantId: string, id: string): Promise<FixedAsset | null>;
  /** Posted / draft run lines of an asset, newest first. */
  abstract assetRuns(tenantId: string, id: string): Promise<{ runId: string; docNo: string; period: string; periodEnd: string; charge: number; status: string; months: number }[]>;
  abstract fiscalYears(tenantId: string): Promise<{ id: string; code: string; startDate: string; endDate: string }[]>;

  abstract listTransfers(tenantId: string, assetId: string | null, status: string | null): Promise<AssetTransfer[]>;
  abstract getTransfer(tenantId: string, id: string): Promise<AssetTransfer | null>;

  abstract listDisposals(tenantId: string, q: AssetQuery): Promise<AssetDisposalList>;
  abstract getDisposal(tenantId: string, id: string): Promise<AssetDisposal | null>;
  abstract disposalOf(tenantId: string, assetId: string): Promise<{ id: string; docNo: string; status: string; disposalDate: string } | null>;

  abstract listRuns(tenantId: string, q: AssetQuery): Promise<DepreciationRunList>;
  abstract getRun(tenantId: string, id: string): Promise<DepreciationRun | null>;
  abstract runForPeriod(tenantId: string, fiscalPeriodId: string): Promise<{ id: string; docNo: string } | null>;

  abstract save(fn: AssetSave, data: Record<string, unknown>): Promise<string>;
  abstract run(fn: AssetAction, id: string, text?: string | null): Promise<void>;
  abstract capitalise(id: string, billLineId: string | null): Promise<void>;
  abstract setStatus(table: 'disposal', tenantId: string, id: string, status: string): Promise<void>;
  /** Deletes a never-capitalised asset / a draft run (with its lines) / a draft disposal; false when it changed. */
  abstract deleteDraft(kind: 'asset' | 'run' | 'disposal', tenantId: string, id: string, rowVersion: number): Promise<boolean>;
}
