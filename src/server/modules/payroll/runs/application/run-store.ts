import type { PayrollGlLine, PayrollOverview, PayrollRun, RunInputs, RunList, RunOptions, RunPreview } from '../../../../../shared/index.js';

export type RunBase = Omit<PayrollRun, 'approval' | 'waitingOn' | 'can' | 'inputs' | 'glPreview'>;

/** The run parameters that decide who is in scope. */
export type RunScope = {
  runId: string | null; runType: string; payrollMonth: string; periodFrom: string; periodTo: string; payGroupId: string | null;
  includeNoticePeriod: boolean; includeExited: boolean; branchIds: string[] | null;
};

/** One employee in scope with every fact the calculator needs (gathered by the store, computed by the domain). */
export type ScopeEmployee = {
  employeeId: string; code: string; status: string; joiningDate: string; exitDate: string | null; branchId: string | null; departmentId: string | null;
  gradeId: string | null; costCentreId: string | null; salaryId: string; structureId: string; addonStructureId: string | null; basicAmount: number;
  payMode: string; isRevised: boolean;
};
export type EmployeeFacts = {
  unpaidDays: number; outsideDays: number; paidLeaveDays: number; missingPunches: { date: string }[]; absentDays: number; hasRegister: boolean;
  statutory: { eobi: boolean; pessi: boolean; pf: boolean }; taxStatus: string; bankName: string | null; iban: string | null;
  loans: { loanId: string; loanType: string; docNo: string; amount: number; label: string }[];
  declarations: { ZAKAT: number; VPS_PENSION: number; DONATION: number; HEALTH_INSURANCE: number };
  ytdGross: number; ytdTaxable: number; ytdTax: number; prevNet: number | null;
};
export type StoredAdjustment = { id: string; employeeId: string; componentId: string; amount: number; quantity: number | null; isTaxable: boolean; inputSource: string; remarks: string | null; sourceDocType: string | null; sourceDocId: string | null };

export abstract class RunStore {
  abstract list(tenantId: string, q: { status?: string; year?: string; page: number; pageSize: number }): Promise<RunList>;
  abstract get(tenantId: string, id: string): Promise<RunBase | null>;
  abstract options(tenantId: string): Promise<RunOptions>;
  /** An open (not rejected / cancelled / reversed) regular run of the month and pay group. */
  abstract openRegular(tenantId: string, month: string, payGroupId: string | null, exceptId?: string): Promise<{ id: string; docNo: string; status: string } | null>;
  abstract previous(tenantId: string, month: string): Promise<RunPreview['previous']>;
  abstract scope(tenantId: string, s: RunScope): Promise<ScopeEmployee[]>;
  abstract facts(tenantId: string, s: RunScope, employees: ScopeEmployee[], taxYear: { taxYear: string; start: string }): Promise<Map<string, EmployeeFacts>>;
  abstract workingDays(tenantId: string, from: string, to: string): Promise<{ workingDays: number; publicHolidays: number }>;
  abstract adjustments(tenantId: string, runId: string): Promise<StoredAdjustment[]>;
  abstract inputs(tenantId: string, run: RunBase): Promise<RunInputs>;
  abstract glPreview(tenantId: string, runId: string, salaryPayableAccountId: string): Promise<PayrollGlLine[]>;
  abstract overview(tenantId: string): Promise<PayrollOverview>;
  abstract bankAdvice(tenantId: string, runId: string): Promise<{ code: string; name: string; bankName: string | null; iban: string | null; accountTitle: string | null; netAmount: number; payMode: string; paymentRef: string | null }[]>;
  abstract salaryPayableDefault(tenantId: string): Promise<string | null>;

  /** Payroll.payrollRunAddUpdate (header, adjustments, lines + components, branches, checklist). */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Columns the save function leaves alone (status, step, calculation time). */
  abstract set(tenantId: string, id: string, data: Record<string, unknown>): Promise<void>;
  abstract refreshTotals(id: string): Promise<void>;
  abstract setChecklist(tenantId: string, runId: string, itemKey: string, isDone: boolean, userId: string): Promise<void>;
  abstract pullOvertime(id: string, employeeIds: string[]): Promise<number>;
  abstract releaseInputs(id: string, all: boolean): Promise<number>;
  abstract call(fn: 'submit' | 'approve' | 'post' | 'sendBack' | 'reject' | 'cancel' | 'reverse', id: string, text?: string | null): Promise<void>;
  abstract pay(id: string, data: Record<string, unknown>): Promise<string>;
}
