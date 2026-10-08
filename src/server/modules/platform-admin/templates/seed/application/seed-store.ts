import type { AdminHistoryPage, PermissionModule, SeedLeaveType, SeedListKind, SeedSalaryComponent, SeedTaxCode } from '../../../../../../shared/index.js';

/** Port: the master seed lists (Platform.Template* tables). Writes run inside a UnitOfWork. */
export abstract class SeedStore {
  abstract leaveTypes(): Promise<SeedLeaveType[]>;
  abstract salaryComponents(): Promise<SeedSalaryComponent[]>;
  abstract taxCodes(): Promise<SeedTaxCode[]>;
  /** Platform.template<Kind>AddUpdate. Returns the id. */
  abstract save(kind: SeedListKind, data: Record<string, unknown>): Promise<string>;
  /** A company row was seeded from it (e.g. HumanResources.LeaveTypes.seedLeaveTypeId)? */
  abstract inUse(kind: SeedListKind, id: string): Promise<boolean>;
  abstract remove(kind: SeedListKind, id: string, rowVersion: number): Promise<void>;
}

/** Port: the default grants of each system role (Platform.SystemRoleGrants, no id: keyed by systemKey + permission). */
export abstract class RoleGrantStore {
  /** Active SystemKey lookups, in sort order. */
  abstract systemRoles(): Promise<{ systemKey: string; label: string; isActive: boolean }[]>;
  abstract catalogue(): Promise<PermissionModule[]>;
  abstract grants(): Promise<{ systemKey: string; permissionCode: string }[]>;
  /** Last change per system role from the platform log, made by a person (not the seed). */
  abstract lastChanged(): Promise<Map<string, string>>;
  /** Direct writes (no AddUpdate function for this table): inserts and deletes, each audited. */
  abstract apply(systemKey: string, add: string[], remove: string[]): Promise<void>;
  abstract history(systemKey: string, limit: number, offset: number): Promise<AdminHistoryPage>;
}
