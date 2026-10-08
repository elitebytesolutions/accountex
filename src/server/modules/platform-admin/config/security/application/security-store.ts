import type { AllowedIp, SecuritySettings } from '../../../../../../shared/index.js';

/** The stored settings row (id = 1) as the API shows it, without the request-specific caller fields. */
export type StoredSecuritySettings = Omit<SecuritySettings, 'callerIp' | 'callerIpAllowed' | 'callerMatch'>;

/** Port: Platform.PlatformSecuritySettings (single row) and Platform.PlatformAllowedIps. */
export abstract class SecurityStore {
  abstract settings(): Promise<StoredSecuritySettings | null>;
  abstract saveSettings(data: Record<string, unknown>): Promise<void>;
  abstract allowedIps(): Promise<AllowedIp[]>;
  abstract addAllowedIp(data: { cidr: string; label: string | null }): Promise<string>;
  abstract removeAllowedIp(id: string): Promise<void>;
}

/** What the Super Admin sign-in enforces (settings row + active ranges). */
export type LoginPolicy = {
  ipAllowlistEnforced: boolean;
  ranges: { cidr: string; label: string; isActive: boolean }[];
  lockoutAttempts: number;
  lockoutMinutes: number;
  pwMinLength: number;
  pwRequireMixedCase: boolean;
  pwRequireNumber: boolean;
  pwRequireSymbol: boolean;
  pwBlockBreached: boolean;
  pwBlockReuse: boolean;
};

/** Port: the Super Admin sign-in state on Platform.PlatformAdmin (failedLoginCount, lockedUntil, lastLoginAt). */
export abstract class AdminLoginPolicyStore {
  /** Null when the settings row is missing (then nothing is enforced). */
  abstract policy(): Promise<LoginPolicy | null>;
  abstract lockedUntil(adminId: string): Promise<Date | null>;
  /** Counts a failed attempt atomically; at `attempts` it locks for `minutes` and resets the count. Returns the new lock, if set now. */
  abstract recordFailure(adminId: string, attempts: number, minutes: number): Promise<Date | null>;
  /** Clears the count and lock, stamps lastLoginAt. */
  abstract recordSuccess(adminId: string): Promise<void>;
  abstract setPasswordHash(adminId: string, hash: string): Promise<void>;
}
