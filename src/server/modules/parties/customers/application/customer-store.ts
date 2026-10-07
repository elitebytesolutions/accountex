import type { Customer, CustomerDetail, CustomerListQuery, ListResult } from '../../../../../shared/index.js';

export type CustomerSummary = { total: number; byStatus: Record<string, number>; cities: string[]; newThisQuarter: number; onHold: string[] };
export type FormOptions = {
  groups: { id: string; code: string; name: string }[];
  branches: { id: string; name: string }[];
  salesReps: { id: string; name: string }[];
  priceLists: { id: string; code: string; name: string; isDefault: boolean }[];
  accounts: { id: string; code: string; name: string }[];
};

export abstract class CustomerStore {
  abstract page(tenantId: string, q: CustomerListQuery): Promise<ListResult<Customer>>;
  abstract summary(tenantId: string): Promise<CustomerSummary>;
  abstract detail(tenantId: string, id: string): Promise<CustomerDetail | null>;
  /** Every customer code ever used, deleted rows included (codes are never reused). */
  abstract allCodes(tenantId: string): Promise<{ code: string; deleted: boolean }[]>;
  abstract formOptions(tenantId: string): Promise<FormOptions>;
  abstract activeGroup(tenantId: string, id: string): Promise<boolean>;
  abstract activePriceList(tenantId: string, id: string): Promise<boolean>;
  abstract activeBranch(tenantId: string, id: string): Promise<boolean>;
  abstract activeUser(tenantId: string, id: string): Promise<boolean>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  abstract saveContact(data: Record<string, unknown>): Promise<string>;
  abstract saveAddress(data: Record<string, unknown>): Promise<string>;
  abstract saveNote(data: Record<string, unknown>): Promise<string>;
  /** The customer a child row belongs to, with the child's row version (and the note's author). */
  abstract childOwner(tenantId: string, kind: 'contact' | 'address' | 'note', id: string): Promise<{ customerId: string; rowVersion: number; authorUserId?: string | null } | null>;
  /** Used by anything other than its own contacts / addresses / notes. */
  abstract inUse(id: string): Promise<boolean>;
  abstract addressInUse(id: string): Promise<boolean>;
  /** Soft-deletes the customer with its contacts and addresses (notes stay). */
  abstract softDelete(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteContact(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract softDeleteAddress(tenantId: string, id: string, rowVersion: number): Promise<void>;
  abstract deleteNote(tenantId: string, id: string, rowVersion: number): Promise<void>;
}
