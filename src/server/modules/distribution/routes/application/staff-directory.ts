export type StaffMember = { id: string; code: string; name: string; roles: string[] };

/**
 * Port: employees who can work a route (HumanResources.Employees, built in Phase 11) and the system roles each holds
 * through Employees.appUserId → Company.UserRoles → Roles.systemKey. Empty until employees exist.
 */
export abstract class StaffDirectory {
  /** Live (not exited, not deleted) employees with their role keys. */
  abstract members(tenantId: string): Promise<StaffMember[]>;
  /** The named employees (any state), for display and checks. */
  abstract byIds(tenantId: string, ids: string[]): Promise<StaffMember[]>;
}
