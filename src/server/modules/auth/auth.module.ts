import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './application/auth.service.js';
import { SignInStore } from './application/sign-in-store.js';
import { PrismaSignInStore } from './infrastructure/prisma-sign-in.store.js';
import { AuthController } from './presentation/auth.controller.js';
import { RecoveryStore } from './application/recovery-store.js';
import { RecoveryService } from './application/recovery.service.js';
import { PrismaRecoveryStore } from './infrastructure/prisma-recovery.store.js';
import { RecoveryController } from './presentation/recovery.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, RecoveryController],
  providers: [AuthService, { provide: SignInStore, useClass: PrismaSignInStore }, RecoveryService, { provide: RecoveryStore, useClass: PrismaRecoveryStore }],
})
export class AuthModule {}
