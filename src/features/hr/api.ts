import type { BranchHr, Department, Designation, Device, DeviceSyncLog, Employee, EmployeeFormOptions, EmployeeList, Grade, Holiday, HrFormOptions, LeaveType, ListResult, OrgChart, OvertimePolicy, Shift } from "@/shared";
import { apiRequest } from "@/lib/api/client";

type Body = Record<string, unknown>;
type Version = { rowVersion: number };
const qs = (q: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const del = (path: string, rowVersion: number) => apiRequest<void>(`${path}?rowVersion=${rowVersion}`, { method: "DELETE" });
const toggle = <T,>(path: string, on: boolean, rowVersion: number) => apiRequest<T>(`${path}/${on ? "activate" : "deactivate"}`, { method: "POST", body: { rowVersion } });

/** Browser clients for Phase 10 HR organisation. */
export const hrOptions = () => apiRequest<HrFormOptions>("/hr/form-options");
export const hrBranches = () => apiRequest<HrFormOptions["branches"]>("/hr/branches");
export const orgChart = (view: "people" | "departments" | "positions") => apiRequest<OrgChart>(`/hr/org?${qs({ view })}`);

export const listDepartments = (q: { search?: string; status?: string } = {}) => apiRequest<ListResult<Department>>(`/hr/departments?${qs({ ...q, pageSize: 500 })}`);
export const createDepartment = (body: Body) => apiRequest<Department>("/hr/departments", { method: "POST", body });
export const updateDepartment = (id: string, body: Body & Version) => apiRequest<Department>(`/hr/departments/${id}`, { method: "PATCH", body });
export const setDepartmentActive = (id: string, on: boolean, rv: number) => toggle<Department>(`/hr/departments/${id}`, on, rv);
export const deleteDepartment = (id: string, rv: number) => del(`/hr/departments/${id}`, rv);

export const listDesignations = () => apiRequest<Designation[]>("/hr/designations");
export const createDesignation = (body: Body) => apiRequest<Designation>("/hr/designations", { method: "POST", body });
export const updateDesignation = (id: string, body: Body & Version) => apiRequest<Designation>(`/hr/designations/${id}`, { method: "PATCH", body });
export const setDesignationActive = (id: string, on: boolean, rv: number) => toggle<Designation>(`/hr/designations/${id}`, on, rv);
export const deleteDesignation = (id: string, rv: number) => del(`/hr/designations/${id}`, rv);

export const listGrades = () => apiRequest<Grade[]>("/hr/grades");
export const createGrade = (body: Body) => apiRequest<Grade>("/hr/grades", { method: "POST", body });
export const updateGrade = (id: string, body: Body & Version) => apiRequest<Grade>(`/hr/grades/${id}`, { method: "PATCH", body });
export const setGradeActive = (id: string, on: boolean, rv: number) => toggle<Grade>(`/hr/grades/${id}`, on, rv);
export const deleteGrade = (id: string, rv: number) => del(`/hr/grades/${id}`, rv);

export const listShifts = () => apiRequest<Shift[]>("/hr/shifts");
export const createShift = (body: Body) => apiRequest<Shift>("/hr/shifts", { method: "POST", body });
export const updateShift = (id: string, body: Body & Version) => apiRequest<Shift>(`/hr/shifts/${id}`, { method: "PATCH", body });
export const setShiftActive = (id: string, on: boolean, rv: number) => toggle<Shift>(`/hr/shifts/${id}`, on, rv);
export const makeShiftDefault = (id: string, rv: number) => apiRequest<Shift>(`/hr/shifts/${id}/default`, { method: "POST", body: { rowVersion: rv } });
export const deleteShift = (id: string, rv: number) => del(`/hr/shifts/${id}`, rv);

export const listHolidays = (q: { from?: string; to?: string; branch?: string } = {}) => apiRequest<Holiday[]>(`/hr/holidays?${qs(q)}`);
export const createHoliday = (body: Body) => apiRequest<Holiday>("/hr/holidays", { method: "POST", body });
export const updateHoliday = (id: string, body: Body & Version) => apiRequest<Holiday>(`/hr/holidays/${id}`, { method: "PATCH", body });
export const setHolidayStatus = (id: string, status: string, rowVersion: number) => apiRequest<Holiday>(`/hr/holidays/${id}/status`, { method: "POST", body: { status, rowVersion } });
export const deleteHoliday = (id: string, rv: number) => del(`/hr/holidays/${id}`, rv);

// ---------------------------------------------------------------- Phase 11: people & policies
export const branchHr = () => apiRequest<BranchHr[]>("/hr/branch-settings");
export const saveBranchHr = (branchId: string, body: Body) => apiRequest<BranchHr>(`/hr/branch-settings/${branchId}`, { method: "PUT", body });

export const listEmployees = (q: { search?: string; status?: string; department?: string; branch?: string; type?: string; page?: number; pageSize?: number } = {}) =>
  apiRequest<EmployeeList>(`/hr/employees?${qs(q)}`);
export const employeeOptions = () => apiRequest<EmployeeFormOptions>("/hr/employees/options");
export const getEmployee = (id: string) => apiRequest<Employee>(`/hr/employees/${id}`);
export const createEmployee = (body: Body) => apiRequest<Employee>("/hr/employees", { method: "POST", body });
export const updateEmployee = (id: string, body: Body & Version) => apiRequest<Employee>(`/hr/employees/${id}`, { method: "PATCH", body });
export const employeeAction = (id: string, action: "position" | "confirm" | "status" | "exit" | "rejoin" | "link-user", body: Body & Version) =>
  apiRequest<Employee>(`/hr/employees/${id}/${action}`, { method: "POST", body });
export const putEmployeePart = (id: string, part: "bank-accounts" | "documents" | "statutory", body: Body & Version) =>
  apiRequest<Employee>(`/hr/employees/${id}/${part}`, { method: "PUT", body });
export const deleteEmployee = (id: string, rv: number) => del(`/hr/employees/${id}`, rv);

export const listLeaveTypes = () => apiRequest<LeaveType[]>("/hr/leave-types");
export const leaveTypeOptions = () => apiRequest<{ branches: { id: string; code: string; name: string }[]; grades: { id: string; code: string; name: string }[] }>("/hr/leave-types/options");
export const createLeaveType = (body: Body) => apiRequest<LeaveType>("/hr/leave-types", { method: "POST", body });
export const updateLeaveType = (id: string, body: Body & Version) => apiRequest<LeaveType>(`/hr/leave-types/${id}`, { method: "PATCH", body });
export const setLeaveTypeActive = (id: string, on: boolean, rv: number) => toggle<LeaveType>(`/hr/leave-types/${id}`, on, rv);
export const deleteLeaveType = (id: string, rv: number) => del(`/hr/leave-types/${id}`, rv);

export const listOvertimePolicies = () => apiRequest<OvertimePolicy[]>("/hr/overtime-policies");
export const overtimeGrades = () => apiRequest<{ id: string; code: string; name: string }[]>("/hr/overtime-policies/grades");
export const createOvertimePolicy = (body: Body) => apiRequest<OvertimePolicy>("/hr/overtime-policies", { method: "POST", body });
export const updateOvertimePolicy = (id: string, body: Body & Version) => apiRequest<OvertimePolicy>(`/hr/overtime-policies/${id}`, { method: "PATCH", body });
export const setOvertimePolicyActive = (id: string, on: boolean, rv: number) => toggle<OvertimePolicy>(`/hr/overtime-policies/${id}`, on, rv);
export const deleteOvertimePolicy = (id: string, rv: number) => del(`/hr/overtime-policies/${id}`, rv);

export const listDevices = () => apiRequest<Device[]>("/hr/devices");
export const deviceLogs = (device?: string) => apiRequest<DeviceSyncLog[]>(`/hr/devices/sync-logs?${qs({ device })}`);
export const createDevice = (body: Body) => apiRequest<Device>("/hr/devices", { method: "POST", body });
export const updateDevice = (id: string, body: Body & Version) => apiRequest<Device>(`/hr/devices/${id}`, { method: "PATCH", body });
export const setDeviceActive = (id: string, on: boolean, rv: number) => toggle<Device>(`/hr/devices/${id}`, on, rv);
export const deleteDevice = (id: string, rv: number) => del(`/hr/devices/${id}`, rv);
