import { Injectable } from '@nestjs/common';
import type { Customer, CustomerDetail, CustomerListQuery, ListResult } from '../../../../../shared/index.js';
import { ConcurrencyError } from '../../../../core/domain/errors.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import type { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { isReferenced } from '../../../../infrastructure/prisma/references.js';
import { CustomerStore, type CustomerSummary, type FormOptions } from '../application/customer-store.js';

type Row = Prisma.CustomersGetPayload<object>;
const SORTABLE = new Set(['name', 'code', 'city', 'creditLimit', 'createdAt']);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const some = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];

@Injectable()
export class PrismaCustomerStore extends CustomerStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async page(tenantId: string, q: CustomerListQuery): Promise<ListResult<Customer>> {
    const db = this.prisma.db();
    const s = q.search?.trim();
    const where: Prisma.CustomersWhereInput = {
      tenantId, deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.group && { customerGroupId: q.group }),
      ...(q.city && { city: q.city }),
      ...(s && {
        OR: ['name', 'displayName', 'code', 'ntn', 'cnic', 'mobile', 'phone', 'email', 'city'].map((f) => ({ [f]: { contains: s, mode: 'insensitive' as const } })),
      }),
    };
    const field = q.sort?.replace(/^-/, '');
    const orderBy = field && SORTABLE.has(field) ? [{ [field]: q.sort!.startsWith('-') ? 'desc' : 'asc' }] : [{ name: 'asc' as const }];
    const [rows, total] = await Promise.all([
      db.customers.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.customers.count({ where }),
    ]);
    return { items: await this.map(tenantId, rows), total };
  }

  async summary(tenantId: string): Promise<CustomerSummary> {
    const db = this.prisma.db();
    const now = new Date();
    const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
    const [byStatus, cities, fresh, held] = await Promise.all([
      db.customers.groupBy({ by: ['status'], where: { tenantId, deletedAt: null }, _count: { _all: true } }),
      db.customers.findMany({ where: { tenantId, deletedAt: null, city: { not: null } }, select: { city: true }, distinct: ['city'], orderBy: { city: 'asc' } }),
      db.customers.count({ where: { tenantId, deletedAt: null, createdAt: { gte: quarterStart } } }),
      db.customers.findMany({ where: { tenantId, deletedAt: null, status: 'ON_HOLD' }, select: { name: true }, orderBy: { onHoldSince: 'desc' }, take: 3 }),
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count._all]));
    return { total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts, cities: cities.map((c) => c.city!), newThisQuarter: fresh, onHold: held.map((h) => h.name) };
  }

  async detail(tenantId: string, id: string): Promise<CustomerDetail | null> {
    const db = this.prisma.db();
    const row = await db.customers.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!row) return null;
    const [[c], contacts, addresses, notes] = await Promise.all([
      this.map(tenantId, [row]),
      db.customerContacts.findMany({ where: { tenantId, customerId: id, deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] }),
      db.customerAddresses.findMany({ where: { tenantId, customerId: id, deletedAt: null }, orderBy: [{ addressType: 'asc' }, { isDefault: 'desc' }, { label: 'asc' }] }),
      db.customerNotes.findMany({ where: { tenantId, customerId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const authors = await db.users.findMany({ where: { tenantId, id: { in: some(notes.map((n) => n.authorUserId)) } }, select: { id: true, fullName: true } });
    return {
      ...c!,
      contacts: contacts.map((x) => ({ id: x.id, fullName: x.fullName, designation: x.designation, mobile: x.mobile, phone: x.phone, email: x.email, isPrimary: x.isPrimary, receivesInvoices: x.receivesInvoices, rowVersion: x.rowVersion })),
      addresses: addresses.map((a) => ({ id: a.id, addressType: a.addressType, label: a.label, addressLine: a.addressLine, area: a.area, city: a.city, province: a.province, contactName: a.contactName, contactPhone: a.contactPhone, isDefault: a.isDefault, rowVersion: a.rowVersion })),
      notes: notes.map((n) => {
        const a = authors.find((u) => u.id === n.authorUserId);
        return { id: n.id, note: n.note, author: a ? { id: a.id, name: a.fullName } : null, createdAt: n.createdAt.toISOString(), rowVersion: n.rowVersion };
      }),
    };
  }

  async allCodes(tenantId: string) {
    const rows = await this.prisma.db().customers.findMany({ where: { tenantId }, select: { code: true, deletedAt: true } });
    return rows.map((r) => ({ code: r.code, deleted: r.deletedAt !== null }));
  }

  async formOptions(tenantId: string): Promise<FormOptions> {
    const db = this.prisma.db();
    const [groups, branches, users, accounts, priceLists] = await Promise.all([
      db.customerGroups.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      db.branches.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.users.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
      db.chartOfAccounts.findMany({ where: { tenantId, kind: 'POSTABLE', status: 'ACTIVE', deletedAt: null, accountClass: 1 }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      db.priceLists.findMany({ where: { tenantId, deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, isDefault: true }, orderBy: { name: 'asc' } }),
    ]);
    return { groups, branches, salesReps: users.map((u) => ({ id: u.id, name: u.fullName })), accounts, priceLists };
  }

  async activeGroup(tenantId: string, id: string) {
    return (await this.prisma.db().customerGroups.count({ where: { tenantId, id, deletedAt: null, isActive: true } })) > 0;
  }

  async activePriceList(tenantId: string, id: string) {
    return (await this.prisma.db().priceLists.count({ where: { tenantId, id, deletedAt: null, status: 'ACTIVE' } })) > 0;
  }

  async activeBranch(tenantId: string, id: string) {
    return (await this.prisma.db().branches.count({ where: { tenantId, id, status: 'ACTIVE', deletedAt: null } })) > 0;
  }

  async activeUser(tenantId: string, id: string) {
    return (await this.prisma.db().users.count({ where: { tenantId, id, status: 'ACTIVE' } })) > 0;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'customerAddUpdate', data);
  }

  saveContact(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'customerContactAddUpdate', data);
  }

  saveAddress(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'customerAddressAddUpdate', data);
  }

  saveNote(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'customerNoteAddUpdate', data);
  }

  async childOwner(tenantId: string, kind: 'contact' | 'address' | 'note', id: string) {
    const db = this.prisma.db();
    if (kind === 'contact') return db.customerContacts.findFirst({ where: { tenantId, id, deletedAt: null }, select: { customerId: true, rowVersion: true } });
    if (kind === 'address') return db.customerAddresses.findFirst({ where: { tenantId, id, deletedAt: null }, select: { customerId: true, rowVersion: true } });
    return db.customerNotes.findFirst({ where: { tenantId, id }, select: { customerId: true, rowVersion: true, authorUserId: true } });
  }

  inUse(id: string) {
    return isReferenced(this.prisma, 'customers', id, ['customerContacts', 'customerAddresses', 'customerNotes']);
  }

  addressInUse(id: string) {
    return isReferenced(this.prisma, 'customerAddresses', id);
  }

  async softDelete(tenantId: string, id: string, rowVersion: number) {
    const db = this.prisma.db();
    const { count } = await db.customers.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date() } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this customer. Reload and try again.');
    await db.customerContacts.updateMany({ where: { tenantId, customerId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await db.customerAddresses.updateMany({ where: { tenantId, customerId: id, deletedAt: null }, data: { deletedAt: new Date() } });
  }

  async softDeleteContact(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().customerContacts.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isPrimary: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this contact. Reload and try again.');
  }

  async softDeleteAddress(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().customerAddresses.updateMany({ where: { tenantId, id, rowVersion, deletedAt: null }, data: { deletedAt: new Date(), isDefault: false } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this address. Reload and try again.');
  }

  async deleteNote(tenantId: string, id: string, rowVersion: number) {
    const { count } = await this.prisma.db().customerNotes.deleteMany({ where: { tenantId, id, rowVersion } });
    if (count !== 1) throw new ConcurrencyError('Someone else changed this note. Reload and try again.');
  }

  private async map(tenantId: string, rows: Row[]): Promise<Customer[]> {
    if (!rows.length) return [];
    const db = this.prisma.db();
    const [groups, users, branches, gl, lists] = await Promise.all([
      db.customerGroups.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.customerGroupId)) } }, select: { id: true, name: true } }),
      db.users.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.salesRepUserId)) } }, select: { id: true, fullName: true } }),
      db.branches.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.branchId)) } }, select: { id: true, name: true } }),
      db.chartOfAccounts.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.receivableAccountId)) } }, select: { id: true, code: true, name: true } }),
      db.priceLists.findMany({ where: { tenantId, id: { in: some(rows.map((r) => r.priceListId)) } }, select: { id: true, name: true } }),
    ]);
    const ref = <T extends { id: string }>(xs: T[], id: string | null) => (id ? (xs.find((x) => x.id === id) ?? null) : null);
    return rows.map((c) => {
      const rep = ref(users, c.salesRepUserId);
      return {
        id: c.id, code: c.code, name: c.name, displayName: c.displayName, customerType: c.customerType,
        group: ref(groups, c.customerGroupId), priceList: ref(lists, c.priceListId), salesRep: rep ? { id: rep.id, name: rep.fullName } : null, branch: ref(branches, c.branchId),
        customerSince: day(c.customerSince), customerChannel: c.customerChannel,
        ntn: c.ntn, cnic: c.cnic, strn: c.strn, atlStatus: c.atlStatus, isSalesTaxRegistered: c.isSalesTaxRegistered, applyFurtherTax: c.applyFurtherTax,
        deductsWht: c.deductsWht, whtSection: c.whtSection, whtRate: c.whtRate?.toNumber() ?? null, isGstExempt: c.isGstExempt,
        contactPerson: c.contactPerson, mobile: c.mobile, phone: c.phone, email: c.email, billingAddress: c.billingAddress, area: c.area, city: c.city,
        province: c.province, shippingSameAsBilling: c.shippingSameAsBilling, shippingAddress: c.shippingAddress,
        creditLimit: c.creditLimit.toNumber(), paymentTerms: c.paymentTerms, creditDays: c.creditDays, receivableAccount: ref(gl, c.receivableAccountId),
        blockOverLimit: c.blockOverLimit, autoReminders: c.autoReminders,
        guarantorName: c.guarantorName, guarantorFatherName: c.guarantorFatherName, guarantorCnic: c.guarantorCnic, guarantorPhone: c.guarantorPhone, guarantorAddress: c.guarantorAddress,
        status: c.status, holdReason: c.holdReason, onHoldSince: c.onHoldSince?.toISOString() ?? null,
        // Receivables arrive with sales invoices (Phase 23).
        balance: 0, overdue: 0, rowVersion: c.rowVersion,
      };
    });
  }
}
