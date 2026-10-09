import type { EmployeeAssetItem, EmployeeAssetOptions } from '../../../../../shared/index.js';

export abstract class EmployeeAssetStore {
  abstract employee(tenantId: string, id: string): Promise<{ id: string; status: string } | null>;
  abstract list(tenantId: string, employeeId: string): Promise<EmployeeAssetItem[]>;
  abstract get(tenantId: string, id: string): Promise<(EmployeeAssetItem & { employeeId: string }) | null>;
  abstract options(tenantId: string): Promise<EmployeeAssetOptions>;
  abstract issue(data: Record<string, unknown>): Promise<string>;
  abstract return(id: string, returnedOn: string, condition: string, remarks: string | null): Promise<void>;
}
