import type { FbrAuthority, FbrSetting } from '../../../../../shared/index.js';
import type { Sealed } from '../../../../core/application/ports/secret-box.js';

export type CompanyTaxIds = { ntn: string | null; strn: string | null };

export abstract class FbrStore {
  /** Saved settings for both authorities (missing ones are null). */
  abstract settings(tenantId: string): Promise<Record<FbrAuthority, FbrSetting | null>>;
  abstract companyTaxIds(tenantId: string): Promise<CompanyTaxIds>;
  abstract activeBranchIds(tenantId: string, ids: string[]): Promise<string[]>;
  abstract save(data: Record<string, unknown>): Promise<string>;
  /** Phase 28: switches sending to the authority on / off (not part of fbrSettingAddUpdate). */
  abstract setSending(tenantId: string, authority: FbrAuthority, on: boolean): Promise<void>;
  /** Stores (or replaces) the sealed secret for a purpose and returns its id. */
  abstract putSecret(tenantId: string, purpose: string, sealed: Sealed): Promise<string>;
  abstract deleteSecret(tenantId: string, purpose: string): Promise<void>;
  abstract getSecret(tenantId: string, purpose: string): Promise<Sealed | null>;
}
