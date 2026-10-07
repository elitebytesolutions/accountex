import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminTokenService } from '../../core/application/ports/admin-token-service.js';
import { PasswordHasher } from '../../core/application/ports/password-hasher.js';
import { SecretBox } from '../../core/application/ports/secret-box.js';
import { TokenService } from '../../core/application/ports/token-service.js';
import { env } from '../config/env.js';
import { AesGcmSecretBox } from './aes-gcm-secret-box.js';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';
import { JwtAdminTokenService } from './jwt-admin-token-service.js';
import { JwtTokenService } from './jwt-token-service.js';

/** Binds the security ports to their implementations. */
@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.SESSION_TTL_SECONDS },
    }),
  ],
  providers: [
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    { provide: AdminTokenService, useClass: JwtAdminTokenService },
    { provide: SecretBox, useClass: AesGcmSecretBox },
  ],
  exports: [PasswordHasher, TokenService, AdminTokenService, SecretBox],
})
export class SecurityModule {}
