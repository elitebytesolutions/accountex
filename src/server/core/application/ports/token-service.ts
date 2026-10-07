/** A tenant session token names its user and its Company.UserSessions row. */
export type TokenPayload = { userId: string; sessionId: string };

export abstract class TokenService {
  /** Lifetime of a session token (and of its session row). */
  abstract readonly ttlSeconds: number;

  abstract sign(payload: TokenPayload): Promise<string>;

  /** Returns the payload, or null when the token is invalid or expired. */
  abstract verify(token: string): Promise<TokenPayload | null>;
}
