import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './application/auth.service.js';
import { SignInStore } from './application/sign-in-store.js';
import { PrismaSignInStore } from './infrastructure/prisma-sign-in.store.js';
import { AuthController } from './presentation/auth.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: SignInStore, useClass: PrismaSignInStore }],
})
export class AuthModule {}
