import { z } from 'zod';

/**
 * Phase 40: support access (Platform.ImpersonationSessions). The Super Admin signs in to a company as one of its
 * users through a time-boxed session (30 or 60 minutes, a reason, read-only by default). Every change made in it is
 * recorded as "Super Admin <email> as <user>", and the company sees its support-access history.
 */
export const IMPERSONATION_LIMITS = [30, 60] as const;

export type ImpersonationSession = {
  id: string; tenantId: string; tenantCode: string; tenantName: string; staff: string | null; targetUserId: string; targetUserLabel: string;
  reason: string; timeLimitMinutes: number; isReadOnly: boolean; startedAt: string; expiresAt: string; endedAt: string | null;
  endReason: string | null; live: boolean;
};
/** POST /admin/tenants/:id/impersonate: the session, and where to open the workspace (the tenant cookie is set). */
export type ImpersonationStart = { session: ImpersonationSession; openUrl: string };

export const ImpersonationStartSchema = z.object({
  targetUserId: z.uuid().optional(),
  reason: z.string().trim().min(5, 'Say why you need access').max(500),
  timeLimitMinutes: z.union([z.literal(30), z.literal(60)]).default(30),
  isReadOnly: z.boolean().default(true),
});
export type ImpersonationStartInput = z.infer<typeof ImpersonationStartSchema>;

/** What the workspace shell shows while a support session is active (GET /api/auth/me → impersonation). */
export type ImpersonationBanner = { sessionId: string; staff: string; expiresAt: string; isReadOnly: boolean; reason: string };
