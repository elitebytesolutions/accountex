import type { User } from './user.entity.js';

/** Port: the signed-in user as the guard sees it. Only ACTIVE, non-removed users are returned. */
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
}
