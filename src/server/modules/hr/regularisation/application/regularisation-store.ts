import type { RegularisationDetail, RegularisationList } from '../../../../../shared/index.js';

export type RegularisationBase = Omit<RegularisationDetail, 'approval' | 'canAct' | 'waitingOn'>;
export type RegularisationQuery = { status?: string; type?: string; search?: string; employeeId?: string; page: number; pageSize: number };

export abstract class RegularisationStore {
  abstract list(tenantId: string, q: RegularisationQuery): Promise<Omit<RegularisationList, 'items'> & { items: Omit<RegularisationList['items'][number], 'waitingOn'>[] }>;
  abstract get(tenantId: string, id: string): Promise<RegularisationBase | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract set(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract approve(id: string, comment: string | null): Promise<void>;
  abstract reject(id: string, reason: string, comment: string | null, markAbsent: boolean): Promise<void>;
  abstract employeeOf(tenantId: string, userId: string): Promise<{ id: string; branchId: string | null } | null>;
  abstract today(tenantId: string): Promise<string>;
  abstract monthLocked(tenantId: string, date: string): Promise<boolean>;
}
