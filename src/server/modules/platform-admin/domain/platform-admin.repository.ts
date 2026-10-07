import type { PlatformAdmin } from './platform-admin.entity.js';

/** Port: how the application reads the platform admin. Implemented in infrastructure/. */
export abstract class PlatformAdminRepository {
  abstract findById(id: string): Promise<PlatformAdmin | null>;
  abstract findByEmail(email: string): Promise<PlatformAdmin | null>;
}
