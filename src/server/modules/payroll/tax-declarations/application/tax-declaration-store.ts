import type { TaxDeclaration, TaxDeclarationList } from '../../../../../shared/index.js';

export type DeclarationQuery = { status?: string; taxYear?: string; search?: string; page: number; pageSize: number };
export type DeclarationRow = TaxDeclaration & { createdBy: string | null };

export abstract class TaxDeclarationStore {
  abstract list(tenantId: string, q: DeclarationQuery): Promise<TaxDeclarationList>;
  abstract forEmployee(tenantId: string, employeeId: string, taxYear: string): Promise<DeclarationRow[]>;
  abstract get(tenantId: string, id: string): Promise<DeclarationRow | null>;
  /** The declaration whose proof is this attachment. */
  abstract byProof(tenantId: string, attachmentId: string): Promise<DeclarationRow | null>;
  /** The salary in force today and what the tax year has paid and deducted so far (posted / paid runs). */
  abstract projectionFacts(tenantId: string, employeeId: string, taxYear: { start: string }): Promise<{ salary: { structureId: string; addonStructureId: string | null; basicAmount: number } | null; ytdGross: number; ytdTaxable: number; ytdTax: number }>;
  abstract employeeOf(tenantId: string, userId: string): Promise<{ id: string } | null>;
  abstract employeeRef(tenantId: string, employeeId: string): Promise<import('../../../../../shared/index.js').EmpRef | null>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract call(fn: 'submit' | 'approve' | 'reject', id: string, text?: string | null): Promise<void>;
}
