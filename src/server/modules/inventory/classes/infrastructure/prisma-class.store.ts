import { Injectable } from '@nestjs/common';
import type { ProductClass } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ClassStore } from '../application/class-store.js';

@Injectable()
export class PrismaClassStore extends ClassStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(tenantId: string): Promise<ProductClass[]> {
    const db = this.prisma.db();
    const [classes, subs, byClass, bySub] = await Promise.all([
      db.productClasses.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      db.productSubclasses.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      db.products.groupBy({ by: ['productClassId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
      db.products.groupBy({ by: ['productSubclassId'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
    ]);
    const classCount = new Map(byClass.map((c) => [c.productClassId, c._count._all]));
    const subCount = new Map(bySub.map((c) => [c.productSubclassId, c._count._all]));
    return classes.map((c) => ({
      id: c.id, code: c.code, name: c.name, nameUrdu: c.nameUrdu, icon: c.icon, isVisible: c.isVisible, sortOrder: c.sortOrder,
      productCount: classCount.get(c.id) ?? 0,
      subclasses: subs
        .filter((s) => s.productClassId === c.id)
        .map((s) => ({ id: s.id, code: s.code, name: s.name, isVisible: s.isVisible, sortOrder: s.sortOrder, productCount: subCount.get(s.id) ?? 0, rowVersion: s.rowVersion })),
      rowVersion: c.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const db = this.prisma.db();
    const [classes, subclasses] = await Promise.all([
      db.productClasses.findMany({ where: { tenantId }, select: { code: true } }),
      db.productSubclasses.findMany({ where: { tenantId }, select: { code: true } }),
    ]);
    return { classes: classes.map((c) => c.code), subclasses: subclasses.map((s) => s.code) };
  }

  saveClass(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productClassAddUpdate', data);
  }

  saveSubclass(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'productSubclassAddUpdate', data);
  }

  /** Live sub types count as use (soft-deleted ones don't). */
  classInUse(id: string) {
    return isReferenced(this.prisma, 'productClasses', id);
  }

  subclassInUse(id: string) {
    return isReferenced(this.prisma, 'productSubclasses', id);
  }

  async softDeleteClass(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().productClasses.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this class. Reload and try again.');
  }

  async softDeleteSubclass(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().productSubclasses.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this sub type. Reload and try again.');
  }
}
