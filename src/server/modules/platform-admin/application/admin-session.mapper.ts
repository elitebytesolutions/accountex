import type { AdminSession } from '../../../../shared/index.js';
import type { PlatformAdmin } from '../domain/platform-admin.entity.js';

/** The only shape of the admin that leaves the API. Never includes the password hash. */
export const toAdminSession = (admin: PlatformAdmin): AdminSession => ({
  id: admin.id,
  email: admin.email,
  name: admin.name,
});
