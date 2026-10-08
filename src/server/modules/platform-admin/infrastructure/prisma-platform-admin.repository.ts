import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PlatformAdmin } from '../domain/platform-admin.entity.js';
import { PlatformAdminRepository } from '../domain/platform-admin.repository.js';

const adminColumns = { id: true, email: true, fullName: true, passwordHash: true, staffId: true } as const;

type AdminRow = { id: string; email: string; fullName: string; passwordHash: string; staffId: string | null };

@Injectable()
export class PrismaPlatformAdminRepository extends PlatformAdminRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string) {
    return this.toEntity(await this.prisma.platformAdmin.findUnique({ where: { id }, select: adminColumns }));
  }

  async findByEmail(email: string) {
    return this.toEntity(await this.prisma.platformAdmin.findUnique({ where: { email }, select: adminColumns }));
  }

  private toEntity(row: AdminRow | null): PlatformAdmin | null {
    return row ? new PlatformAdmin(row.id, row.email, row.fullName, row.passwordHash, row.staffId) : null;
  }
}
