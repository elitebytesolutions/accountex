import { Injectable } from '@nestjs/common';
import type { AdminSession, AllowedIp, AllowedIpCreate, SecuritySettings, SecuritySettingsUpdate } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { matchingRange, normalizeClientIp, parseCidr, wouldLockOut, type AllowRange } from '../domain/ip-allowlist.js';
import { SecurityStore } from './security-store.js';

const selfLockout = (message: string) => new ConflictError(message, undefined, { code: 'SECURITY_SELF_LOCKOUT' });

/**
 * Platform security settings and the console IP allow-list (System › Security & Privacy). Every change is checked
 * against the request making it: a save that would leave the caller's own IP outside an enforced allow-list is refused
 * with 409 SECURITY_SELF_LOCKOUT, so the Super Admin can't lock themselves out.
 */
@Injectable()
export class SecurityService {
  constructor(
    private readonly store: SecurityStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async settings(meta: RequestMeta): Promise<SecuritySettings> {
    const s = await this.store.settings();
    if (!s) throw new NotFoundError('Security settings are missing. Run prisma/sql/103-admin-platform-config.sql.');
    const ip = normalizeClientIp(meta.clientIp);
    const match = matchingRange(ip, await this.store.allowedIps());
    return { ...s, callerIp: ip, callerIpAllowed: match !== null, callerMatch: match ? `${match.cidr} · ${match.label}` : null };
  }

  async updateSettings(admin: AdminSession, meta: RequestMeta, input: SecuritySettingsUpdate): Promise<SecuritySettings> {
    const s = await this.store.settings();
    if (!s) throw new NotFoundError('Security settings are missing.');
    if (s.rowVersion !== input.rowVersion) throw new ConcurrencyError('Someone else changed the security settings. Reload and try again.');

    // SSO is stored only until Phase 29: requiring it without the break-glass password would leave no way in.
    if (input.requireSso && !input.breakGlassSuperAdmin) {
      throw selfLockout('Keep break-glass password sign-in for the Super Admin while SSO is required (SSO sign-in turns on with Phase 29).');
    }
    const ranges = await this.store.allowedIps();
    if (input.ipAllowlistEnforced) {
      if (!ranges.some((r) => r.isActive)) throw new ValidationError('Add at least one network range before enforcing the allow-list.', { ipAllowlistEnforced: ['Add a range first'] });
      if (wouldLockOut(true, ranges, normalizeClientIp(meta.clientIp))) {
        throw selfLockout(`Your IP ${normalizeClientIp(meta.clientIp) ?? '(unknown)'} is not on the allow-list. Add it before enforcing, or you would be locked out.`);
      }
    }

    const { samlCertPem, rowVersion, ...fields } = input;
    await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.saveSettings({ ...fields, ...(samlCertPem !== undefined && { samlCertPem }), id: 1, rowVersion }));
    return this.settings(meta);
  }

  allowedIps(): Promise<AllowedIp[]> {
    return this.store.allowedIps();
  }

  /** Adds an IPv4 range (host bits cleared). Adding never locks anyone out. */
  async addAllowedIp(admin: AdminSession, meta: RequestMeta, input: AllowedIpCreate): Promise<AllowedIp> {
    const c = parseCidr(input.cidr);
    if (!c) throw new ValidationError(`“${input.cidr}” is not a valid IPv4 CIDR (e.g. 182.180.0.0/16)`, { cidr: ['An IPv4 CIDR such as 182.180.0.0/16'] });
    const ranges = await this.store.allowedIps();
    if (ranges.some((r) => r.cidr === c.text)) throw new ConflictError(`${c.text} is already on the list`, { cidr: ['Already on the list'] }, { code: 'DB_UNIQUE_VIOLATION' });
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.addAllowedIp({ cidr: c.text, label: input.label }));
    return (await this.store.allowedIps()).find((r) => r.id === id)!;
  }

  /** Removing a range is refused when it would empty an enforced list or cut off the caller's own IP. */
  async removeAllowedIp(admin: AdminSession, meta: RequestMeta, id: string): Promise<void> {
    const [s, ranges] = await Promise.all([this.store.settings(), this.store.allowedIps()]);
    if (!ranges.some((r) => r.id === id)) throw new NotFoundError('Range not found');
    const after: AllowRange[] = ranges.filter((r) => r.id !== id);
    if (s?.ipAllowlistEnforced) {
      if (!after.some((r) => r.isActive)) throw new ValidationError('Keep at least one range while the allow-list is enforced.', { cidr: ['Last active range'] });
      if (wouldLockOut(true, after, normalizeClientIp(meta.clientIp))) {
        throw selfLockout('Removing this range would lock you out: it is the one your IP signs in from.');
      }
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.removeAllowedIp(id));
  }
}
