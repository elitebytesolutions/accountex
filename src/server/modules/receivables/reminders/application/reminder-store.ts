import type { ReminderRule, ReminderTemplate } from '../../../../../shared/index.js';

export abstract class ReminderStore {
  abstract templates(tenantId: string): Promise<ReminderTemplate[]>;
  /** Every template code ever used, deleted ones included (codes are never reused). */
  abstract templateCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract saveTemplate(data: Record<string, unknown>): Promise<string>;
  abstract templateInUse(id: string): Promise<boolean>;
  abstract softDeleteTemplate(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract rules(tenantId: string): Promise<ReminderRule[]>;
  abstract saveRule(data: Record<string, unknown>): Promise<string>;
  abstract ruleInUse(id: string): Promise<boolean>;
  abstract deleteRule(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract activeUser(tenantId: string, id: string): Promise<boolean>;
  abstract lookupCodes(type: 'DunningLevel' | 'PaymentReminderRuleAction'): Promise<string[]>;
  /** Preview values: the company name and, when given, the customer's name. */
  abstract previewNames(tenantId: string, customerId: string | null): Promise<{ company: string; customer: string | null }>;
}
