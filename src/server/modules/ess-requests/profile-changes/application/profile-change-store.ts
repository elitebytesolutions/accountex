import type { MyProfile, ProfileChangeQuery, ProfileChangeRequest, ProfileFieldKey } from '../../../../../shared/self-service/profile-change.js';

/** Current values of the requestable fields, raw (codes / ids) as stored. */
export type ProfileValues = Record<ProfileFieldKey, string | null>;

export abstract class ProfileChangeStore {
  /** The signed-in user's employee record id, or null. */
  abstract employeeOfUser(tenantId: string, userId: string): Promise<string | null>;
  /** Users signed in as this employee (Users.employeeId or Employees.appUserId). */
  abstract usersOfEmployee(tenantId: string, employeeId: string): Promise<string[]>;
  abstract header(tenantId: string, employeeId: string): Promise<MyProfile['employee'] | null>;
  abstract values(tenantId: string, employeeId: string): Promise<ProfileValues>;
  /** FieldKey lookup labels and the coded fields' choices. */
  abstract labels(tenantId: string): Promise<{ fields: Record<string, string>; choices: MyProfile['choices'] }>;

  abstract list(tenantId: string, q: ProfileChangeQuery & { employeeId?: string }): Promise<{ items: ProfileChangeRequest[]; total: number; counts: Record<string, number> }>;
  abstract get(tenantId: string, id: string): Promise<ProfileChangeRequest | null>;
  abstract hasPending(tenantId: string, employeeId: string, fieldKey: ProfileFieldKey): Promise<boolean>;

  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Withdraw / reject (the save function does not write status): checks rowVersion, false when stale. */
  abstract setStatus(tenantId: string, id: string, rowVersion: number, status: 'WITHDRAWN' | 'REJECTED', review?: { userId: string; comment: string }): Promise<boolean>;
  /** Writes the value to the employee's record; false when the field has nowhere to go (no bank / statutory row, no column). */
  abstract apply(tenantId: string, employeeId: string, fieldKey: ProfileFieldKey, value: string): Promise<boolean>;
  /** EmployeeSelfService.profileChangeRequestApprove: PENDING → APPROVED (refuses the preparer). */
  abstract approve(id: string, comment: string | null): Promise<void>;
}
