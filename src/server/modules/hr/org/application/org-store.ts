import type { BranchHr, HrFormOptions } from '../../../../../shared/index.js';

export type OrgDepartment = { id: string; code: string; name: string; parentId: string | null; division: string | null; isActive: boolean };
export type OrgDesignation = { id: string; title: string; departmentId: string; reportsToDesignationId: string | null; approvedPositions: number; gradeCode: string | null; isActive: boolean };
/** A current (not exited) employee as the chart needs them. */
export type OrgEmployee = { id: string; code: string; name: string; designationId: string; departmentId: string; branchId: string; managerId: string | null };

export abstract class OrgStore {
  abstract departments(tenantId: string): Promise<OrgDepartment[]>;
  abstract designations(tenantId: string): Promise<OrgDesignation[]>;
  abstract employees(tenantId: string): Promise<OrgEmployee[]>;
  abstract branches(tenantId: string): Promise<HrFormOptions['branches']>;
  abstract options(tenantId: string): Promise<HrFormOptions>;
  abstract branchHr(tenantId: string): Promise<BranchHr[]>;
  abstract saveBranchHr(data: Record<string, unknown>): Promise<string>;
}
