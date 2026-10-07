import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { PasswordHasher } from '../../core/application/ports/password-hasher.js';

const ROUNDS = 12;
// Compared against when there is no stored hash, so a missing user costs the same time as a wrong password.
const DUMMY_HASH = '$2b$12$QNaksmkoOT15Uwt/ldXpYu0Dl.AYDCtZ3HRMx7bS.RICGmOnkQdL.';

@Injectable()
export class BcryptPasswordHasher extends PasswordHasher {
  hash(plain: string) {
    return hash(plain, ROUNDS);
  }

  async verify(plain: string, stored: string | null) {
    const matches = await compare(plain, stored ?? DUMMY_HASH);
    return stored !== null && matches;
  }
}
