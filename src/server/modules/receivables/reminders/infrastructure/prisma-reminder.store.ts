import { Injectable } from '@nestjs/common';
import type { ReminderRule, ReminderTemplate } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { ReminderStore } from '../application/reminder-store.js';

@Injectable()
export class PrismaReminderStore extends ReminderStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async templates(tenantId: string): Promise<ReminderTemplate[]> {
    const db = this.prisma.db();
    const [rows, counts] = await Promise.all([
      db.paymentReminderTemplates.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
      db.paymentReminderRules.groupBy({ by: ['templateId'], where: { tenantId }, _count: { _all: true } }),
    ]);
    return rows.map((t) => ({
      id: t.id, code: t.code, name: t.name, emailSubject: t.emailSubject, bodyEn: t.bodyEn, bodyUr: t.bodyUr, isActive: t.isActive,
      ruleCount: counts.find((c) => c.templateId === t.id)?._count._all ?? 0, rowVersion: t.rowVersion,
    }));
  }

  async templateCodes(tenantId: string) {
    const rows = await this.prisma.db().paymentReminderTemplates.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  saveTemplate(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'paymentReminderTemplateAddUpdate', data);
  }

  templateInUse(id: string) {
    return isReferenced(this.prisma, 'reminderTemplates', id);
  }

  async softDeleteTemplate(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().paymentReminderTemplates.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this message. Reload and try again.');
  }

  async rules(tenantId: string): Promise<ReminderRule[]> {
    const db = this.prisma.db();
    const rows = await db.paymentReminderRules.findMany({ where: { tenantId }, orderBy: { offsetDays: 'asc' } });
    const [tpls, users] = await Promise.all([
      db.paymentReminderTemplates.findMany({ where: { tenantId, id: { in: rows.map((r) => r.templateId) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: rows.map((r) => r.escalateToUserId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } }),
    ]);
    return rows.map((r) => {
      const u = users.find((x) => x.id === r.escalateToUserId);
      return {
        id: r.id, name: r.name, offsetDays: r.offsetDays, dunningLevel: r.dunningLevel, sendWhatsapp: r.sendWhatsapp, sendSms: r.sendSms, sendEmail: r.sendEmail,
        template: tpls.find((t) => t.id === r.templateId) ?? { id: r.templateId, name: '?' }, action: r.action, attachStatement: r.attachStatement,
        escalate: r.escalate, escalateTo: u ? { id: u.id, name: u.fullName } : null, applyCreditHold: r.applyCreditHold,
        runTime: r.runTime.toISOString().slice(11, 16), isActive: r.isActive, sentCount: r.sentCount, rowVersion: r.rowVersion,
      };
    });
  }

  saveRule(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'paymentReminderRuleAddUpdate', data);
  }

  ruleInUse(id: string) {
    return isReferenced(this.prisma, 'reminderRules', id);
  }

  async deleteRule(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().paymentReminderRules.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this rule. Reload and try again.');
  }

  async activeUser(tenantId: string, id: string) {
    return (await this.prisma.db().users.count({ where: { tenantId, id, status: 'ACTIVE' } })) > 0;
  }

  async lookupCodes(type: 'DunningLevel' | 'PaymentReminderRuleAction') {
    const rows = await this.prisma.db().$queryRaw<{ code: string }[]>`select code from "Lookups"."Lookups" where "lookupType" = ${type} and "tenantId" is null and "isActive"`;
    return rows.map((r) => r.code);
  }

  async previewNames(tenantId: string, customerId: string | null) {
    const db = this.prisma.db();
    const [t, c] = await Promise.all([
      db.tenants.findFirst({ where: { id: tenantId }, select: { displayName: true } }),
      customerId ? db.customers.findFirst({ where: { tenantId, id: customerId, deletedAt: null }, select: { name: true } }) : null,
    ]);
    return { company: t?.displayName ?? '', customer: c?.name ?? null };
  }
}
