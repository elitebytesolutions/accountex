import type { ProductClass } from '../../../../../shared/index.js';

export abstract class ClassStore {
  /** Classes (sortOrder, name) with their live sub types (sortOrder) and product counts. */
  abstract list(tenantId: string): Promise<ProductClass[]>;
  /** Every class / sub type code ever used, deleted rows included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ classes: string[]; subclasses: string[] }>;
  abstract saveClass(data: Record<string, unknown>): Promise<string>;
  abstract saveSubclass(data: Record<string, unknown>): Promise<string>;
  abstract classInUse(id: string): Promise<boolean>;
  abstract subclassInUse(id: string): Promise<boolean>;
  abstract softDeleteClass(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteSubclass(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
