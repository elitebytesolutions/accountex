/** A chart-of-accounts row as the treasury masters see it. */
export type GlAccount = {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
  kind: string;
  status: string;
  accountClass: number;
  subType: string | null;
  currencyCode: string;
  deleted: boolean;
};

export abstract class GlLinkStore {
  abstract account(tenantId: string, id: string): Promise<GlAccount | null>;
  /** The account a posting role is mapped to (DEFAULT_BANK, CASH_IN_HAND …). */
  abstract mapped(tenantId: string, role: string): Promise<GlAccount | null>;
  /** Children of a group (including deleted ones, whose codes stay taken). */
  abstract children(tenantId: string, parentId: string): Promise<{ code: string; subType: string | null }[]>;
  /** Whether a bank or cash account (including deleted ones) already points at this GL account. */
  abstract linked(tenantId: string, accountId: string): Promise<boolean>;
  abstract createPostable(a: { parentId: string; code: string; name: string; accountClass: number; subType: string; currencyCode: string }): Promise<string>;
}
