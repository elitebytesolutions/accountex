import { Injectable } from '@nestjs/common';
import type { Branch, ListResult } from '../../../../../shared/index.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { BranchStore, type BranchListQuery } from '../application/branch-store.js';

const SORTABLE = new Set(['code', 'name', 'city', 'status', 'createdAt']);

const columns = {
  id: true, code: true, name: true, description: true, isHeadOffice: true, isDefault: true, address: true, city: true,
  province: true, salesTaxAuthority: true, phone: true, email: true, openingDate: true, status: true, rowVersion: true,
} as const;

type Row = Omit<Branch, 'openingDate'> & { openingDate: Date | null };
const toBranch = (r: Row): Branch => ({ ...r, openingDate: r.openingDate ? r.openingDate.toISOString().slice(0, 10) : null });

@Injectable()
export class PrismaBranchStore extends BranchStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string, q: BranchListQuery): Promise<ListResult<Branch>> {
    // Tenant filter is explicit: the app's database role bypasses row-level security.
    const where = {
      tenantId,
      deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.search && {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' as const } },
          { name: { contains: q.search, mode: 'insensitive' as const } },
          { city: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy = field && SORTABLE.has(field)
      ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }]
      : [{ isDefault: 'desc' as const }, { code: 'asc' as const }];
    const db = this.prisma.db();
    const [rows, total] = await Promise.all([
      db.branches.findMany({ where, select: columns, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.branches.count({ where }),
    ]);
    return { items: rows.map(toBranch), total };
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.db().branches.findFirst({ where: { id, tenantId, deletedAt: null }, select: columns });
    return row ? toBranch(row) : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'branchAddUpdate', data);
  }

  async makeDefault(id: string) {
    await this.prisma.db().$executeRaw`select "Company"."branchMakeDefault"(${id}::uuid)`;
  }

  async delete(tenantId: string, id: string) {
    const { count } = await this.prisma.db().branches.deleteMany({ where: { id, tenantId } });
    return count === 1;
  }
}
