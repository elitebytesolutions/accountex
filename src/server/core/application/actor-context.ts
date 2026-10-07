import type { SessionUser } from '../../../shared/index.js';
import type { AuditContext, RequestMeta } from './ports/unit-of-work.js';

/** The audit context of a signed-in workspace user making a request: who, which tenant, which request. */
export const actorContext = (user: SessionUser, meta: RequestMeta): AuditContext => ({
  ...meta,
  userId: user.id,
  tenantId: user.tenantId,
});
