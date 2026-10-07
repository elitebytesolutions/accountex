import { Injectable } from '@nestjs/common';
import { UnitOfWork, type AuditContext } from '../../core/application/ports/unit-of-work.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(context: AuditContext, work: () => Promise<T>): Promise<T> {
    return this.prisma.withContext(context, work);
  }
}
