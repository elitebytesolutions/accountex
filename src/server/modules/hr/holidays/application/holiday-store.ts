import type { Holiday, HolidayListQuery } from '../../../../../shared/index.js';

export abstract class HolidayStore {
  abstract list(tenantId: string, q: HolidayListQuery): Promise<Holiday[]>;
  /** The holiday's branch rows (id + branch), so a save keeps unchanged rows instead of re-creating them. */
  abstract branchRows(tenantId: string, holidayId: string): Promise<{ id: string; branchId: string }[]>;
  abstract activeBranches(tenantId: string, ids: string[]): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
