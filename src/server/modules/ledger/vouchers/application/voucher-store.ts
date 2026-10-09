import type { GlOptions, Voucher, VoucherList, VoucherListQuery } from '../../../../../shared/index.js';

/** A voucher as read for the use cases (without its approval, which the approvals module adds). */
export type VoucherBase = Omit<Voucher, 'approval' | 'routing'>;

export abstract class VoucherStore {
  abstract list(tenantId: string, userId: string, q: VoucherListQuery): Promise<VoucherList>;
  abstract get(tenantId: string, id: string): Promise<VoucherBase | null>;
  abstract options(tenantId: string): Promise<GlOptions>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Draft ⇄ pending approval and the approval stamp (not through the save function, which only edits drafts). */
  abstract setState(tenantId: string, id: string, data: { status?: string; approvedByUserId?: string | null; approvedAt?: Date | null; submittedAt?: Date | null }): Promise<void>;
  abstract post(id: string): Promise<void>;
  abstract reverse(id: string, date: string, reason: string, remarks: string | null): Promise<string>;
  abstract addActivity(tenantId: string, voucherId: string, userId: string | null, action: string, detail: string | null): Promise<void>;
  abstract deleteDraft(tenantId: string, id: string, rowVersion: number): Promise<void>;
  /** Posted JVs whose auto-reverse date has come and that are not reversed yet. */
  abstract dueAutoReversals(tenantId: string, today: string): Promise<{ id: string; autoReverseOn: string }[]>;
}
