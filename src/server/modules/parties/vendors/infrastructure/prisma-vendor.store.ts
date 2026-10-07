import { Injectable } from '@nestjs/common';
import type { ListResult, Vendor, VendorDetail, VendorListQuery } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { VendorStore, type VendorFormOptions, type VendorSummary } from '../application/vendor-store.js';

type Row = Prisma.VendorsGetPayload<object>;
type ContactRow = Prisma.VendorContactsGetPayload<object>;
const SORTABLE = new Set(['name', 'code', 'city', 'createdAt']);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const some = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
const contact = (x: ContactRow) => ({ id: x.id, fullName: x.fullName, designation: x.designation, phone: x.phone, mobile: x.mobile, email: x.email, isPrimary: x.isPrimary, rowVersion: x.rowVersion });

@Injectable()
export class PrismaVendorStore extends VendorStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: VendorListQuery): Promise<ListResult<Vendor>> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const where: Prisma.VendorsWhereInput = {
      tenantId, deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.category && { categoryId: q.category }),
      ...(q.atl && { atlStatus: q.atl }),
      ...(s && { OR: ['name', 'legalName', 'code', 'ntn', 'cnic', 'phone', 'email', 'city'].map((f) => ({ [f]: { contains: s, mode: 'insensitive' as const } })) }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy = field && SORTABLE.has(field) ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }] : [{ name: 'asc' as const }];
    const [rows, total] = await Promise.all([
      db.vendors.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.vendors.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async summary(tenantId: string): Promise<VendorSummary> {
    const db = this.prisma.db();
    const [byAtl, active, categories] = await Promise.all([
      db.vendors.groupBy({ by: ['atlStatus'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
      db.vendors.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
      db.vendorCategories.count({ where: { tenantId, deletedAt: null, isActive: true } }),
    ]);
    const counts = Object.fromEntries(byAtl.map((b) => [b.atlStatus, b._count._all]));
    return { total: Object.values(counts).reduce((a, b) => a + b, 0), active, categories, byAtl: counts };
  }

  async detail(tenantId: string, id: string): Promise<VendorDetail | null> {
    const db = this.prisma.db();
    const row = await db.vendors.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!row) return null;
    const [[v], contacts, banks] = await Promise.all([
      this.map(tenantId, [row]),
      db.vendorContacts.findMany({ where: { tenantId, vendorId: id, deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] }),
      db.vendorBankAccounts.findMany({ where: { tenantId, vendorId: id, deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { bankName: 'asc' }] }),
    ]);
    return {
      ...v!,
      contacts: contacts.map(contact),
      bankAccounts: banks.map((b) => ({
        id: b.id, bankName: b.bankName, branchName: b.branchName, accountTitle: b.accountTitle, accountNo: b.accountNo, iban: b.iban, swiftCode: b.swiftCode,
        currencyCode: b.currencyCode, isPrimary: b.isPrimary, isActive: b.isActive, rowVersion: b.rowVersion,
      })),
    };
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().vendors.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async formOptions(tenantId: string): Promise<VendorFormOptions> {
    const db = this.prisma.db();
    const postable = { tenantId, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null };
    const [categories, currencies, defaults, payables] = await Promise.all([
      db.vendorCategories.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      db.currencies.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { ...postable, accountClass: { in: [1, 5] } }, select: { id: true, code: true, name: true, accountClass: true }, orderBy: { code: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { ...postable, accountClass: 2 }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    ]);
    return { categories, currencies, defaultAccounts: defaults, payableAccounts: payables };
  }

  async activeCategory(tenantId: string, id: string) {
    return (await this.prisma.db().vendorCategories.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
  }

  async activeCurrency(code: string) {
    return (await this.prisma.db().currencies.count({ where: { code, isActive: true } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'vendorAddUpdate', data);
  }

  saveContact(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'vendorContactAddUpdate', data);
  }

  saveBank(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'vendorBankAccountAddUpdate', data);
  }

  async childOwner(tenantId: string, kind: 'contact' | 'bank', id: string) {
    const db = this.prisma.db();
    return kind === 'contact'
      ? db.vendorContacts.findFirst({ where: { tenantId, id, deletedAt: null }, select: { vendorId: true, rowVersion: true } })
      : db.vendorBankAccounts.findFirst({ where: { tenantId, id, deletedAt: null }, select: { vendorId: true, rowVersion: true } });
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'vendors', id, ['vendorContacts', 'vendorBankAccounts']);
  }

  bankInUse(id: string) {
    return isReferenced(this.prisma, 'vendorBankAccounts', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const { count } = await db.vendors.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this vendor. Reload and try again.');
    await db.vendorContacts.updateMany({ where: { tenantId, vendorId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await db.vendorBankAccounts.updateMany({ where: { tenantId, vendorId: id, deletedAt: null }, data: { deletedAt: new Date() } });
  }

  async softDeleteContact(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().vendorContacts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isPrimary: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this contact. Reload and try again.');
  }

  async softDeleteBank(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().vendorBankAccounts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isPrimary: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this bank account. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<Vendor[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const ids = rows.map((r) => r.id);
    const [cats, gl, primaries] = await Promise.all([
      db.vendorCategories.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.categoryId)) } }, select: { id: true, name: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: some(rows.flatMap((r) => [r.defaultAccountId, r.payableAccountId])) } }, select: { id: true, code: true, name: true } }),
      db.vendorContacts.findMany({ where: { tenantId, vendorId: { in: ids }, isPrimary: true, deletedAt: null } }),
    ]);
    const ref = <T extends { id: string }>(xs: T[], id: string | null) => (id ? (xs.find((x) => x.id === id) ?? null) : null);
    return rows.map((v) => {
      const p = primaries.find((c) => c.vendorId === v.id);
      return {
        id: v.id, code: v.code, name: v.name, legalName: v.legalName, category: ref(cats, v.categoryId), ntn: v.ntn, cnic: v.cnic, strn: v.strn,
        atlStatus: v.atlStatus, atlVerifiedAt: v.atlVerifiedAt?.toISOString() ?? null, defaultWhtSection: v.defaultWhtSection,
        defaultAccount: ref(gl, v.defaultAccountId), payableAccount: ref(gl, v.payableAccountId), paymentTerms: v.paymentTerms, creditDays: v.creditDays,
        currencyCode: v.currencyCode, phone: v.phone, email: v.email, address: v.address, city: v.city, bankName: v.bankName, iban: v.iban,
        vendorSince: day(v.vendorSince), status: v.status, remarks: v.remarks, primaryContact: p ? contact(p) : null,
        // Payables arrive with vendor bills (Phase 21).
        payable: 0, overdue: 0, rowVersion: v.rowVersion,
      };
    });
  }
}
