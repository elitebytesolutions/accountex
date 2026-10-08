import { Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../../../../core/domain/errors.js';
import { allowlistBlocks, normalizeClientIp } from '../domain/ip-allowlist.js';
import { isLocked, minutesLeft, passwordPolicyErrors } from '../domain/password-policy.js';
import { AdminLoginPolicyStore } from './security-store.js';

/**
 * What the Super Admin sign-in enforces from Platform security (Phase 38), used by AdminAuthService:
 *  - IP allow-list, only when enforced AND it has an active range (break-glass: an empty list never blocks; saving a list
 *    that excludes the saving admin's own IP is refused with SECURITY_SELF_LOCKOUT);
 *  - lockout: N failed passwords lock the account for M minutes (it lifts by itself);
 *  - password policy on a password change.
 * Without a settings row nothing is enforced. SSO and MFA are stored only (Phase 29).
 */
@Injectable()
export class AdminLoginPolicy {
  constructor(private readonly store: AdminLoginPolicyStore) {}

  /** 403 ADMIN_IP_NOT_ALLOWED when an enforced, non-empty allow-list has no range containing the request IP. */
  async assertNetworkAllowed(clientIp: string | undefined): Promise<void> {
    const p = await this.store.policy();
    if (!p) return;
    const ip = normalizeClientIp(clientIp);
    if (allowlistBlocks(p.ipAllowlistEnforced, p.ranges, ip)) {
      throw new ForbiddenError('The console can\'t be reached from this network.', undefined, { code: 'ADMIN_IP_NOT_ALLOWED', log: { clientIp: ip } });
    }
  }

  /** 423 AUTH_ACCOUNT_LOCKED while a lock is in force (checked before the password, so a locked account can't be probed). */
  async assertNotLocked(adminId: string): Promise<void> {
    const until = await this.store.lockedUntil(adminId);
    if (until && isLocked(until)) throw this.lockedError(until);
  }

  /** Counts a wrong password; returns the 423 error to throw when this attempt set the lock. */
  async recordFailure(adminId: string): Promise<Error | null> {
    const p = await this.store.policy();
    if (!p) return null;
    const lockedUntil = await this.store.recordFailure(adminId, p.lockoutAttempts, p.lockoutMinutes);
    return lockedUntil ? this.lockedError(lockedUntil) : null;
  }

  recordSuccess(adminId: string): Promise<void> {
    return this.store.recordSuccess(adminId);
  }

  /** 422 PASSWORD_TOO_WEAK with the unmet rules. Re-use of the current password is refused by the request schema. */
  async assertPasswordAllowed(password: string): Promise<void> {
    const p = await this.store.policy();
    if (!p) return;
    const problems = passwordPolicyErrors(password, p);
    if (problems.length) throw new ValidationError(`Password policy: ${problems.join(' · ')}`, { newPassword: problems }, { code: 'PASSWORD_TOO_WEAK' });
  }

  setPasswordHash(adminId: string, hash: string) {
    return this.store.setPasswordHash(adminId, hash);
  }

  private lockedError(until: Date) {
    const m = minutesLeft(until);
    return new UnauthorizedError(`Too many failed sign-ins. Try again in ${m} minute${m === 1 ? '' : 's'}.`, undefined, { code: 'AUTH_ACCOUNT_LOCKED' });
  }
}
