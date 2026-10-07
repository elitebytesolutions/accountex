export type AdminTokenPayload = { adminId: string };

/** Tokens for the Super Admin portal. Signed separately from tenant tokens and never interchangeable. */
export abstract class AdminTokenService {
  abstract sign(payload: AdminTokenPayload): Promise<string>;

  /** Returns the payload, or null when the token is invalid, expired or not an admin token. */
  abstract verify(token: string): Promise<AdminTokenPayload | null>;
}
