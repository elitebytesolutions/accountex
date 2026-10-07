import type { MyPreferences, MyPreferencesResponse, MyProfile, MyProfileUpdate, UserActivity } from '../../../../shared/index.js';

/** Port: the signed-in user's own account data. Writes run inside a UnitOfWork as that user. */
export abstract class MeStore {
  abstract profile(tenantId: string, userId: string): Promise<MyProfile | null>;
  abstract updateProfile(userId: string, input: MyProfileUpdate): Promise<void>;
  abstract passwordHash(userId: string): Promise<{ hash: string | null; rowVersion: number } | null>;
  /** New own password: clears mustChangePassword. */
  abstract setPassword(userId: string, rowVersion: number, hash: string): Promise<void>;
  /** The saved row, or the column defaults with saved=false. */
  abstract preferences(tenantId: string, userId: string): Promise<MyPreferencesResponse>;
  /** The user's own latest actions (audit entries they authored). */
  abstract activity(tenantId: string, userId: string, limit: number): Promise<UserActivity[]>;
  abstract savePreferences(tenantId: string, userId: string, prefs: MyPreferences, rowVersion?: number): Promise<void>;
}
