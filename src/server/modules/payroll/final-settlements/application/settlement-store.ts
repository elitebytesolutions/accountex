import type { SettlementCalcSummary, SettlementDetail, SettlementGlLine, SettlementList, SettlementOptions, SettlementQuery } from '../../../../../shared/index.js';
import type { SettlementSalaryFacts } from '../domain/settlement-facts.js';

/** The detail without the approval / permission parts the service adds. */
export type SettlementBase = Omit<SettlementDetail, 'approval' | 'waitingOn' | 'can'>;
export type SettlementSalaryRow = {
  basicAmount: number; structureId: string; addonStructureId: string | null; statutory: { eobi: boolean; pessi: boolean; pf: boolean };
};

export abstract class SettlementStore {
  abstract list(tenantId: string, q: SettlementQuery): Promise<SettlementList>;
  abstract get(tenantId: string, id: string): Promise<SettlementBase | null>;
  abstract options(tenantId: string, id: string): Promise<SettlementOptions>;
  abstract glPreview(tenantId: string, id: string): Promise<SettlementGlLine[]>;
  /** The salary in force on the last working day (null: the employee has no salary). */
  abstract salaryOn(tenantId: string, employeeId: string, date: string): Promise<SettlementSalaryRow | null>;
  abstract start(offboardingId: string): Promise<string>;
  abstract calculate(id: string, facts: SettlementSalaryFacts): Promise<SettlementCalcSummary>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract setWords(tenantId: string, id: string): Promise<void>;
  abstract setApprovalRequest(tenantId: string, id: string, requestId: string): Promise<void>;
  abstract call(fn: 'submit' | 'approve' | 'sendBack' | 'cancel', id: string, text?: string | null): Promise<void>;
  abstract pay(id: string, data: Record<string, unknown>): Promise<void>;
  /** The exit's employee, joining date and last working day. */
  abstract exitFacts(tenantId: string, offboardingId: string): Promise<{ employeeId: string; joiningDate: string; lastWorkingDay: string } | null>;
  /** The settlement of an exit that is not cancelled. */
  abstract ofOffboarding(tenantId: string, offboardingId: string): Promise<{ id: string; docNo: string; status: string } | null>;
}
