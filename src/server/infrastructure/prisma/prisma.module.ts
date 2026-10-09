import { Global, Module } from '@nestjs/common';
import { MailSender } from '../../core/application/ports/mail-sender.js';
import { Notifier } from '../../core/application/ports/notifier.js';
import { UnitOfWork } from '../../core/application/ports/unit-of-work.js';
import { LogMailSender } from '../notifications/log-mail-sender.js';
import { PrismaNotifier } from '../notifications/prisma-notifier.js';
import { PrismaUnitOfWork } from './prisma-unit-of-work.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, { provide: UnitOfWork, useClass: PrismaUnitOfWork }, { provide: Notifier, useClass: PrismaNotifier }, { provide: MailSender, useClass: LogMailSender }],
  exports: [PrismaService, UnitOfWork, Notifier, MailSender],
})
export class PrismaModule {}
