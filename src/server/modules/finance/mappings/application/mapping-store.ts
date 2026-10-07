import type { AccountMapping } from '../../../../../shared/index.js';

/** Port: posting roles and the account each one posts to. Writes run inside a UnitOfWork. */
export abstract class MappingStore {
  /** Posting roles (settings-screen roles only unless `all`) with their mapped account. */
  abstract list(tenantId: string, all: boolean): Promise<AccountMapping[]>;
  abstract roleExists(role: string): Promise<boolean>;
  /** Of `ids`, this company's active postable accounts. */
  abstract postableAccounts(tenantId: string, ids: string[]): Promise<string[]>;
  /** Sets (or clears, when accountId is null) the account of a role. */
  abstract set(tenantId: string, role: string, accountId: string | null): Promise<void>;
}
