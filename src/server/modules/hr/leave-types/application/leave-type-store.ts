import type { LeaveRuleInput, LeaveType } from '../../../../../shared/index.js';

export type PolicyOptions = { branches: { id: string; code: string; name: string }[]; grades: { id: string; code: string; name: string }[] };

export abstract class LeaveTypeStore {
  abstract list(tenantId: string): Promise<LeaveType[]>;
  abstract options(tenantId: string): Promise<PolicyOptions>;
  /** Every code ever used, deleted types included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract replaceRules(leaveTypeId: string, rules: LeaveRuleInput[]): Promise<void>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
