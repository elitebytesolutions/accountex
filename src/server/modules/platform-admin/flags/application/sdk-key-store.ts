import type { FlagSdkKey } from '../../../../../shared/index.js';

/** Port: Platform.FlagSdkKeys. */
export abstract class SdkKeyStore {
  /** Active and grace keys (revoked ones too when `all`), newest first. */
  abstract list(all: boolean): Promise<FlagSdkKey[]>;
  abstract get(id: string): Promise<FlagSdkKey | null>;
  abstract active(environment: string, kind: string): Promise<FlagSdkKey | null>;
  /** Platform.flagSdkKeyAddUpdate. */
  abstract save(data: Record<string, unknown>): Promise<string>;
}

/** A freshly issued key: the secret (shown once) and what is stored. Client IDs are public and stored as is. */
export type MintedKey = { secret: string; keyPrefix: string; keyLast4: string; keyHash: string | null; clientId: string | null };

/** Port: generates and hashes SDK keys. */
export abstract class SdkKeyMinter {
  abstract mint(environment: string, kind: string): MintedKey;
}
