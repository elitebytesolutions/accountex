import type { ListResult, Vendor, VendorDetail, VendorListQuery } from '../../../../../shared/index.js';

export type VendorSummary = { total: number; active: number; categories: number; byAtl: Record<string, number> };
export type VendorFormOptions = {
  categories: { id: string; name: string }[];
  currencies: { code: string; name: string }[];
  defaultAccounts: { id: string; code: string; name: string; accountClass: number }[];
  payableAccounts: { id: string; code: string; name: string }[];
};

export abstract class VendorStore {
  abstract page(tenantId: string, q: VendorListQuery): Promise<ListResult<Vendor>>;
  abstract summary(tenantId: string): Promise<VendorSummary>;
  abstract detail(tenantId: string, id: string): Promise<VendorDetail | null>;
  /** Every vendor code ever used, deleted rows included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract formOptions(tenantId: string): Promise<VendorFormOptions>;
  abstract activeCategory(tenantId: string, id: string): Promise<boolean>;
  abstract activeCurrency(code: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract saveContact(data: Record<string, unknown>): Promise<string>;
  abstract saveBank(data: Record<string, unknown>): Promise<string>;
  /** The vendor a contact / bank account belongs to, with the child's row version. */
  abstract childOwner(tenantId: string, kind: 'contact' | 'bank', id: string): Promise<{ vendorId: string; rowVersion: number } | null>;
  /** Used by anything other than its own contacts / bank accounts. */
  abstract inUse(id: string): Promise<boolean>;
  abstract bankInUse(id: string): Promise<boolean>;
  /** Soft-deletes the vendor with its contacts and bank accounts. */
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteContact(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteBank(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
