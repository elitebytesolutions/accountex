import type { Addon } from '../../../../../../shared/index.js';

/** Port: add-ons and their availability per plan (Platform schema). */
export abstract class AddonStore {
  abstract list(): Promise<Addon[]>;
  abstract get(id: string): Promise<Addon | null>;
  /** Every code in use, deleted add-ons included (the code stays unique). */
  abstract allCodes(): Promise<{ id: string; code: string; deleted: boolean }[]>;
  abstract moduleExists(id: string): Promise<boolean>;
  abstract planExists(id: string): Promise<boolean>;
  /** Platform.addonAddUpdate (plans[] replace the add-on's rows). Returns the id. */
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Tenants, invoices or usage alert rules use it? */
  abstract inUse(id: string): Promise<boolean>;
  abstract softDelete(id: string, rowVersion: number): Promise<void>;
}
