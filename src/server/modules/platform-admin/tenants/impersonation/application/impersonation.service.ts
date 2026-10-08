import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  TENANT_SIGN_IN_STATUSES,
  type AdminSession, type ImpersonationBanner, type ImpersonationSession, type ImpersonationStartInput, type SessionUser,
} from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { TokenService } from '../../../../../core/application/ports/token-service.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { ImpersonationStore } from './impersonation-store.js';

/**
 * Support access (Phase 40): the Super Admin signs in to a company as one of its users through a time-boxed
 * Platform.ImpersonationSessions row. The tenant session it gets (UserSessions.authMethod IMPERSONATION) expires with
 * the support session; the auth guard refuses writes when it is read-only and names the Super Admin in the row history
 * of every change. One live session per admin.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    private readonly store: ImpersonationStore,
    private readonly tokens: TokenService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(filter: { tenantId?: string; liveOnly?: boolean }) {
    return this.store.list(filter);
  }

  /** Starts a session and returns it with the tenant token the controller sets as the workspace cookie. */
  async start(admin: AdminSession, meta: RequestMeta, tenantId: string, input: ImpersonationStartInput): Promise<{ session: ImpersonationSession; token: string; expiresAt: Date }> {
    const target = await this.store.target(tenantId, input.targetUserId);
    if (!target) throw new ValidationError('Choose an active user of this company', { targetUserId: ['Unknown or inactive user'] });
    if (!TENANT_SIGN_IN_STATUSES.includes(target.tenantStatus)) {
      throw new ConflictError('This company is not live, so nobody can sign in to it.', undefined, { code: 'TENANT_STATUS_ORDER' });
    }
    const ctx = adminActorContext(admin, meta);
    const live = await this.store.liveForStaff(admin.staffId!);
    if (live) {
      if (live.expiresAt.getTime() > Date.now()) {
        throw new ConflictError('You already have a support session open. End it before starting another.', undefined, { code: 'IMPERSONATION_ACTIVE' });
      }
      await this.unitOfWork.run(ctx, () => this.store.end(live.id, 'EXPIRED'));
    }
    const userSessionId = randomUUID();
    const token = await this.tokens.sign({ userId: target.userId, sessionId: userSessionId });
    const expiresAt = new Date(Date.now() + input.timeLimitMinutes * 60_000);
    const id = await this.unitOfWork.run(ctx, () => this.store.start({
      tenantId, staffId: admin.staffId!, target, reason: input.reason, timeLimitMinutes: input.timeLimitMinutes, isReadOnly: input.isReadOnly,
      userSessionId, tokenHash: new Uint8Array(createHash('sha256').update(token).digest()), expiresAt, ipAddress: meta.clientIp, userAgent: meta.userAgent,
    }));
    return { session: (await this.store.get(id))!, token, expiresAt };
  }

  async end(admin: AdminSession, meta: RequestMeta, id: string): Promise<ImpersonationSession> {
    const s = await this.store.get(id);
    if (!s) throw new NotFoundError('Support session not found');
    if (s.endedAt) throw new ConflictError('This support session has already ended.');
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.end(id, 'MANUAL'));
    return (await this.store.get(id))!;
  }

  // ---------------------------------------------------------------- the company's side
  /** The banner the workspace shows while the current session is a support session, else null. */
  async current(sessionId: string | undefined): Promise<ImpersonationBanner | null> {
    const s = sessionId ? await this.store.byUserSession(sessionId) : null;
    return s && s.live ? { sessionId: s.id, staff: s.staff ?? 'Accountex support', expiresAt: s.expiresAt, isReadOnly: s.isReadOnly, reason: s.reason } : null;
  }

  /**
   * "End session" in the workspace banner: ends the support session behind the current tenant session. The person
   * clicking it is the Super Admin, so the change is recorded as theirs (platform rows name platform staff).
   */
  async endCurrent(user: SessionUser, meta: RequestMeta): Promise<void> {
    const s = meta.sessionId ? await this.store.byUserSession(meta.sessionId) : null;
    if (!s) throw new NotFoundError('This is not a support session');
    const staff = await this.store.staffOf(s.id);
    await this.unitOfWork.run({ ...meta, userId: staff?.staffId ?? null, tenantId: null, actorLabel: `Super Admin ${staff?.email ?? ''}`.trim(), impersonatedBy: undefined },
      () => this.store.end(s.id, 'MANUAL'));
  }

  /** Settings › Account & Security › Support access: who from Accountex signed in to this company, when and why. */
  history(tenantId: string) {
    return this.store.list({ tenantId });
  }
}
