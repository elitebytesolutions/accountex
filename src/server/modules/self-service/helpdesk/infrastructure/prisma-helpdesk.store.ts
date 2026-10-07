import { Injectable } from '@nestjs/common';
import type { HelpdeskCategory, HelpdeskFaq, MyHelpdesk } from '../../../../../shared/self-service/helpdesk.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { HelpdeskStore } from '../application/helpdesk-store.js';

@Injectable()
export class PrismaHelpdeskStore extends HelpdeskStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async categories(tenantId: string): Promise<HelpdeskCategory[]> {
    const db = this.prisma.db();
    const rows = await db.helpdeskCategories.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const counts = await db.helpdeskFaqs.groupBy({ by: ['categoryId'], where: { tenantId, deletedAt: null }, _count: { _all: true } });
    return rows.map((c) => ({
      id: c.id, code: c.code, name: c.name, description: c.description, ownerEmployeeId: c.ownerEmployeeId,
      slaHours: Number(c.slaHours), highPrioritySlaFactor: Number(c.highPrioritySlaFactor), routingKeywords: c.routingKeywords,
      icon: c.icon, sortOrder: c.sortOrder, status: c.status, faqCount: counts.find((x) => x.categoryId === c.id)?._count._all ?? 0, rowVersion: c.rowVersion,
    }));
  }

  async faqs(tenantId: string): Promise<HelpdeskFaq[]> {
    const db = this.prisma.db();
    const rows = await db.helpdeskFaqs.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }] });
    const cats = await db.helpdeskCategories.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.categoryId))] } }, select: { id: true, code: true, name: true } });
    return rows.map((f) => ({
      id: f.id, category: cats.find((c) => c.id === f.categoryId) ?? { id: f.categoryId, code: '?', name: '?' }, question: f.question, answer: f.answer,
      keywords: f.keywords, sortOrder: f.sortOrder, isPublished: f.isPublished, rowVersion: f.rowVersion,
    }));
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().helpdeskCategories.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async activeEmployee(tenantId: string, id: string) {
    return (await this.prisma.db().employees.count({ where: { tenantId, id, deletedAt: null, status: { not: 'EXITED' } } })) === 1;
  }

  saveCategory(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'helpdeskCategoryAddUpdate', data);
  }

  saveFaq(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'helpdeskFaqAddUpdate', data);
  }

  categoryInUse(id: string) {
    return isReferenced(this.prisma, 'helpdeskCategories', id);
  }

  async softDeleteCategory(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().helpdeskCategories.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this helpdesk category. Reload and try again.');
  }

  async softDeleteFaq(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().helpdeskFaqs.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this FAQ. Reload and try again.');
  }

  async published(tenantId: string): Promise<MyHelpdesk> {
    const db = this.prisma.db();
    const cats = await db.helpdeskCategories.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const faqs = await db.helpdeskFaqs.findMany({
      where: { tenantId, deletedAt: null, isPublished: true, categoryId: { in: cats.map((c) => c.id) } },
      orderBy: [{ sortOrder: 'asc' }, { question: 'asc' }],
    });
    return {
      categories: cats.map((c) => ({ id: c.id, code: c.code, name: c.name, description: c.description, icon: c.icon, slaHours: Number(c.slaHours) })),
      faqs: faqs.map((f) => {
        const c = cats.find((x) => x.id === f.categoryId)!;
        return { id: f.id, question: f.question, answer: f.answer, keywords: f.keywords, category: { code: c.code, name: c.name } };
      }),
    };
  }
}
