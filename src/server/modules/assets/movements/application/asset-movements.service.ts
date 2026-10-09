import { Injectable } from '@nestjs/common';
import type { AssetDisposal, AssetDisposalInput, AssetQuery, AssetTransferInput, SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { FixedAssetStore } from '../../register/application/fixed-asset-store.js';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const invalid = (e: Record<string, string>) => new ValidationError(Object.values(e)[0]!, Object.fromEntries(Object.entries(e).map(([k, m]) => [k, [m]])));
const ACTIVE = ['IN_USE', 'UNDER_REPAIR', 'FULLY_DEPRECIATED'];

/**
 * Transfers (another branch / custodian: requested, then approved by someone else — approval completes it and moves the
 * asset) and disposals (sale, scrap, write-off, trade-in: draft → submitted → approved and posted in one step by
 * someone else; cost and accumulated depreciation are snapshotted, gain / loss and GST posted; cancel reverses).
 */
@Injectable()
export class AssetMovementsService {
  constructor(private readonly store: FixedAssetStore, private readonly unitOfWork: UnitOfWork) {}

  // ---------------------------------------------------------------- transfers
  transfers(user: SessionUser, assetId: string | null, status: string | null) {
    return this.store.listTransfers(user.tenantId, assetId, status);
  }

  async requestTransfer(user: SessionUser, meta: RequestMeta, assetId: string, input: AssetTransferInput) {
    const a = await this.store.getAsset(user.tenantId, assetId);
    if (!a) throw new NotFoundError('Asset not found');
    if (!ACTIVE.includes(a.status)) throw new ConflictError('Only an asset in use can be transferred.', undefined, { code: 'ASSET_NOT_ACTIVE' });
    const o = await this.store.options(user.tenantId);
    if (!o.branches.some((b) => b.id === input.toBranchId)) throw invalid({ toBranchId: 'Choose an active location' });
    if (input.toBranchId === a.branch.id && (input.toCustodianEmployeeId ?? null) === (a.custodian?.id ?? null)) throw invalid({ toBranchId: 'Change the location or the custodian' });
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('assetTransferAddUpdate', {
      assetId, fromBranchId: a.branch.id, toBranchId: input.toBranchId, fromCustodianEmployeeId: a.custodian?.id ?? null, toCustodianEmployeeId: input.toCustodianEmployeeId ?? a.custodian?.id ?? null,
      effectiveDate: input.effectiveDate, reason: input.reason ?? null, requestedByUserId: user.id,
    }));
    return (await this.store.getTransfer(user.tenantId, id))!;
  }

  /** Approve = approved and completed: the asset moves to the new branch / custodian. */
  async approveTransfer(user: SessionUser, meta: RequestMeta, id: string) {
    const t = await this.transfer(user, id);
    if (t.requestedBy?.id === user.id) throw new ForbiddenError('The preparer cannot approve their own transfer.', undefined, { code: 'APPROVAL_SELF' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.run('assetTransferApprove', id, null);
      await this.store.run('assetTransferComplete', id);
    });
    return this.transfer(user, id);
  }

  async rejectTransfer(user: SessionUser, meta: RequestMeta, id: string, reason: string | null) {
    await this.transfer(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('assetTransferReject', id, reason));
    return this.transfer(user, id);
  }

  async cancelTransfer(user: SessionUser, meta: RequestMeta, id: string, reason: string | null) {
    await this.transfer(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('assetTransferCancel', id, reason));
    return this.transfer(user, id);
  }

  private async transfer(user: SessionUser, id: string) {
    const t = await this.store.getTransfer(user.tenantId, id);
    if (!t) throw new NotFoundError('Transfer not found');
    return t;
  }

  // ---------------------------------------------------------------- disposals
  disposals(user: SessionUser, q: AssetQuery) {
    return this.store.listDisposals(user.tenantId, q);
  }

  async disposal(user: SessionUser, id: string): Promise<AssetDisposal> {
    const d = await this.store.getDisposal(user.tenantId, id);
    if (!d) throw new NotFoundError('Disposal not found');
    return d;
  }

  async createDisposal(user: SessionUser, meta: RequestMeta, input: AssetDisposalInput) {
    const data = await this.disposalPayload(user, input);
    const id = await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('assetDisposalAddUpdate', data));
    return this.disposal(user, id);
  }

  async updateDisposal(user: SessionUser, meta: RequestMeta, id: string, input: AssetDisposalInput & { rowVersion: number }) {
    const d = await this.currentDisposal(user, id, input.rowVersion);
    if (d.status !== 'DRAFT') throw new ConflictError('Only a draft disposal can be changed.', undefined, { code: 'DISPOSAL_NOT_EDITABLE' });
    const data = await this.disposalPayload(user, input, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save('assetDisposalAddUpdate', { ...data, id, rowVersion: input.rowVersion }));
    return this.disposal(user, id);
  }

  async deleteDisposal(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.currentDisposal(user, id, rowVersion);
    if (d.status !== 'DRAFT') throw new ConflictError('Only a draft disposal can be deleted; cancel it instead.', undefined, { code: 'DISPOSAL_NOT_EDITABLE' });
    const ok = await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteDraft('disposal', user.tenantId, id, rowVersion));
    if (!ok) throw new ConcurrencyError('This disposal was changed. Reload and try again.');
  }

  async submitDisposal(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number) {
    const d = await this.currentDisposal(user, id, rowVersion);
    if (d.status !== 'DRAFT') throw new ConflictError('Only a draft disposal can be submitted.', undefined, { code: 'DISPOSAL_NOT_EDITABLE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.setStatus('disposal', user.tenantId, id, 'PENDING_APPROVAL'));
    return this.disposal(user, id);
  }

  /** Approve and post (someone other than the preparer): derecognition journal with gain / loss and GST. */
  async approveDisposal(user: SessionUser, meta: RequestMeta, id: string) {
    await this.disposal(user, id);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.run('assetDisposalApprove', id));
    return this.disposal(user, id);
  }

  /** A draft / pending disposal is cancelled; a posted one is reversed (journal) and the asset restored. */
  async cancelDisposal(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number, reason: string) {
    const d = await this.currentDisposal(user, id, rowVersion);
    if (d.status === 'CANCELLED') return d;
    await this.unitOfWork.run(actorContext(user, meta), () => (d.status === 'POSTED' ? this.store.run('assetDisposalCancel', id, reason) : this.store.setStatus('disposal', user.tenantId, id, 'CANCELLED')));
    return this.disposal(user, id);
  }

  private async currentDisposal(user: SessionUser, id: string, rowVersion: number) {
    const d = await this.disposal(user, id);
    if (d.rowVersion !== rowVersion) throw new ConcurrencyError('This disposal was changed. Reload and try again.');
    return d;
  }

  /** Cost and accumulated depreciation snapshotted from the asset; GST from the tax code; gain / loss accounts from the posting roles. */
  private async disposalPayload(user: SessionUser, p: AssetDisposalInput, exceptId?: string) {
    const [a, o, existing] = await Promise.all([this.store.getAsset(user.tenantId, p.assetId), this.store.options(user.tenantId), this.store.disposalOf(user.tenantId, p.assetId)]);
    if (!a) throw invalid({ assetId: 'Choose an asset' });
    if (!ACTIVE.includes(a.status)) throw new ConflictError('Only an asset in use can be disposed.', undefined, { code: 'ASSET_NOT_ACTIVE' });
    if (existing && existing.id !== exceptId) throw new ConflictError(`This asset is already on disposal ${existing.docNo}.`, undefined, { code: 'DISPOSAL_NOT_EDITABLE' });
    const e: Record<string, string> = {};
    const tax = p.taxCodeId ? o.taxCodes.find((t) => t.id === p.taxCodeId) : null;
    if (p.taxCodeId && !tax) e.taxCodeId = 'Choose a sales tax code';
    if (p.receiveIntoAccountId && !o.receiveInto.some((r) => r.accountId === p.receiveIntoAccountId)) e.receiveIntoAccountId = 'Choose a bank or cash account';
    if (p.disposalDate < a.acquisitionDate) e.disposalDate = 'Can’t be before the acquisition date';
    if (Object.keys(e).length) throw invalid(e);
    const proceeds = Number(p.proceeds ?? 0);
    const gstRate = proceeds > 0 && tax?.rate ? tax.rate : 0;
    return {
      assetId: a.id, disposalType: p.disposalType, disposalDate: p.disposalDate, buyerName: p.buyerName ?? null, customerId: p.customerId ?? null, cost: a.cost,
      accumulatedDepreciation: a.accumulatedDepreciation, proceeds, taxCodeId: gstRate > 0 ? p.taxCodeId : null, gstRate, gstAmount: r2((proceeds * gstRate) / 100),
      receiveIntoAccountId: proceeds > 0 ? p.receiveIntoAccountId : null, gainAccountId: o.gainAccountId, lossAccountId: o.lossAccountId,
      outputTaxAccountId: gstRate > 0 ? tax?.accountId ?? null : null, remarks: p.remarks ?? null,
    };
  }
}
