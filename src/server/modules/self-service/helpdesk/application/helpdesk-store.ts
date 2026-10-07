import type { HelpdeskCategory, HelpdeskFaq, MyHelpdesk } from '../../../../../shared/self-service/helpdesk.js';

export abstract class HelpdeskStore {
  abstract categories(tenantId: string): Promise<HelpdeskCategory[]>;
  abstract faqs(tenantId: string): Promise<HelpdeskFaq[]>;
  /** Every category code, deleted ones included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  /** A live (not deleted, not exited) employee. */
  abstract activeEmployee(tenantId: string, id: string): Promise<boolean>;
  abstract saveCategory(data: Record<string, unknown>): Promise<string>;
  abstract saveFaq(data: Record<string, unknown>): Promise<string>;
  abstract categoryInUse(id: string): Promise<boolean>;
  abstract softDeleteCategory(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteFaq(tenantId: string, id: string, rowVersion: number): Promise<void>;
  /** The employee view: active desks and their published answers. */
  abstract published(tenantId: string): Promise<MyHelpdesk>;
}
