import type { SessionUser } from '../../../../shared/index.js';
import type { User } from '../../users/domain/user.entity.js';

/** The only shape of a user that leaves the API. Never includes the password hash. */
export const toSessionUser = (user: User): SessionUser => ({
  id: user.id,
  tenantId: user.tenantId,
  tenantName: user.tenantName,
  email: user.email,
  name: user.name,
  roles: user.roles,
  permissions: user.permissions,
  mustChangePassword: user.mustChangePassword,
  timeZone: user.timeZone,
});
