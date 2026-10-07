export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;

  /**
   * Checks a password against a stored hash. Pass `null` when there is no stored hash
   * (unknown user): implementations still do the full amount of work so timing stays constant.
   */
  abstract verify(plain: string, hash: string | null): Promise<boolean>;
}
