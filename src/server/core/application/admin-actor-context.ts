import type { AdminSession } from '../../../shared/index.js';
import type { AuditContext, RequestMeta } from './ports/unit-of-work.js';

/**
 * The audit context of the signed-in Super Admin (Phase 36 foundation). Every /api/admin write runs in
 * `unitOfWork.run(adminActorContext(admin, meta), …)`: the DB audit trigger then writes Platform.PlatformAuditLogs
 * with staffUserId = the admin's PlatformStaff mirror row and actorLabel "Super Admin <email>". No tenant.
 */
export const adminActorContext = (admin: AdminSession, meta: RequestMeta): AuditContext => ({
  ...meta,
  userId: admin.staffId,
  tenantId: null,
  actorLabel: `Super Admin ${admin.email}`,
});
