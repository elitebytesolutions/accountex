import { Injectable } from '@nestjs/common';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { GlLinkStore, type GlAccount } from '../application/gl-link-store.js';

const select = { id: true, code: true, name: true, level: true, parentAccountId: true, kind: true, status: true, accountClass: true, subType: true, currencyCode: true, deletedAt: true } as const;

@Injectable()
export class PrismaGlLinkStore extends GlLinkStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private map(a: { id: string; code: string; name: string; level: number; parentAccountId: string | null; kind: string; status: string; accountClass: number; subType: string | null; currencyCode: string; deletedAt: Date | null }): GlAccount {
    return { id: a.id, code: a.code, name: a.name, level: a.level, parentId: a.parentAccountId, kind: a.kind, status: a.status, accountClass: a.accountClass, subType: a.subType, currencyCode: a.currencyCode.trim(), deleted: !!a.deletedAt };
  }

  async account(tenantId: string, id: string) {
    const a = await this.prisma.db().chartOfAccounts.findFirst({ where: { tenantId, id }, select });
    return a ? this.map(a) : null;
  }

  async mapped(tenantId: string, role: string) {
    const m = await this.prisma.db().defaultAccountMappings.findFirst({ where: { tenantId, role }, select: { accountId: true } });
    return m ? this.account(tenantId, m.accountId) : null;
  }

  children(tenantId: string, parentId: string) {
    return this.prisma.db().chartOfAccounts.findMany({ where: { tenantId, parentAccountId: parentId }, select: { code: true, subType: true } });
  }

  async linked(tenantId: string, accountId: string) {
    const db = this.prisma.db();
    const [bank, cash] = await Promise.all([db.bankAccounts.count({ where: { tenantId, accountId } }), db.cashAccounts.count({ where: { tenantId, accountId } })]);
    return bank + cash > 0;
  }

  createPostable(a: { parentId: string; code: string; name: string; accountClass: number; subType: string; currencyCode: string }) {
    return addUpdate(this.prisma, 'accountAddUpdate', {
      code: a.code, name: a.name, parentAccountId: a.parentId, level: 4, accountClass: a.accountClass, nature: 'DR', kind: 'POSTABLE',
      subType: a.subType, currencyCode: a.currencyCode, status: 'ACTIVE', branches: [],
    });
  }
}
