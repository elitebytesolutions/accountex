import type { DunningCaseDetail, DunningKpis, DunningPolicySummary, DunningQueueRow } from '../../../../../../shared/index.js';
import type { PlannedAttempt, RetryStep } from '../domain/dunning-schedule.js';

export type ActivePolicy = DunningPolicySummary & { retrySchedule: RetryStep[] };
/** An issued invoice past its due date with a balance and no dunning case yet. */
export type OverdueInvoice = { invoiceId: string; tenantId: string; tenantName: string; docNo: string | null; dueOn: string; balance: number; paymentMethod: string | null };
/** Platform.dunningCaseAdvance's result. */
export type AdvanceResult = { caseId: string; tenantId: string; stageBefore: string; stage: string; tenantBefore?: string; tenantStatus?: string };

/** Port: Platform.DunningCases + DunningAttempts, the collections views, and the dunning database functions. */
export abstract class DunningStore {
  abstract activePolicy(): Promise<ActivePolicy | null>;
  abstract queue(today: string): Promise<DunningQueueRow[]>;
  abstract kpis(): Promise<DunningKpis>;
  abstract detail(id: string, today: string): Promise<DunningCaseDetail | null>;
  /** The company's open case (newest), else its latest case. */
  abstract caseForTenant(tenantId: string): Promise<string | null>;
  abstract caseForInvoice(invoiceId: string): Promise<{ id: string; closed: boolean } | null>;
  abstract overdueWithoutCase(asOf: string): Promise<OverdueInvoice[]>;
  abstract openCaseIds(): Promise<string[]>;
  abstract tenantStatus(tenantId: string): Promise<{ name: string; status: string } | null>;
  /** dunningCaseAddUpdate (with the planned attempts on create). */
  abstract open(c: { tenantId: string; invoiceId: string; policyId: string; amountDue: number; paymentMethod: string | null; attempts: PlannedAttempt[] }): Promise<string>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract advance(id: string, asOf: string, escalate: boolean): Promise<AdvanceResult>;
  /** Platform.dunningTenantSync: the company's status from its open cases. */
  abstract tenantSync(tenantId: string): Promise<{ before: string; after: string } | null>;
  /** Marks the case's next SCHEDULED attempt (or a new one) with a manual result. */
  abstract recordAttempt(caseId: string, a: { method: string; status: 'SUCCEEDED' | 'FAILED'; paymentId: string; failureReason: string | null; staffId: string | null; planDay: number }): Promise<void>;
  abstract cancelScheduled(caseId: string): Promise<void>;
  abstract markUncollectible(invoiceId: string): Promise<void>;
}
