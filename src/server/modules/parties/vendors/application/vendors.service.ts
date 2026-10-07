import { Injectable } from '@nestjs/common';
import {
  termsDays,
  type SessionUser,
  type VendorBankCreate,
  type VendorBankUpdate,
  type VendorContactCreate,
  type VendorContactUpdate,
  type VendorCreate,
  type VendorDetail,
  type VendorListQuery,
  type VendorUpdate,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../../treasury/gl-links/application/gl-links.js';
import { nextPartyCode } from '../../domain/codes.js';
import { VendorStore } from './vendor-store.js';

type Links = { categoryId?: string | null; defaultAccountId?: string | null; payableAccountId?: string | null; currencyCode?: string };
const PK_IBAN = /^PK[0-9]{2}[A-Z]{4}[0-9A-Z]{16}$/;

/**
 * Vendors with their contacts and bank accounts. One primary contact and one primary bank account per vendor; the
 * vendor row's bank / IBAN mirror the primary bank account (its IBAN column only takes Pakistani IBANs).
 */
@Injectable()
export class VendorsService {
  constructor(
    private readonly store: VendorStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: VendorListQuery) {
    return this.store.page(user.tenantId, q);
  }

  summary(user: SessionUser) {
    return this.store.summary(user.tenantId);
  }

  formOptions(user: SessionUser) {
    return this.store.formOptions(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<VendorDetail> {
    const v = await this.store.detail(user.tenantId, id);
    if (!v) throw new NotFoundError('Vendor not found');
    return v;
  }

  /** The template's contact person and bank / IBAN become the primary contact and primary bank account, in one unit of work. */
  async create(user: SessionUser, meta: RequestMeta, input: VendorCreate): Promise<VendorDetail> {
    const codes = await this.store.allCodes(user.tenantId);
    const code = input.code ?? nextPartyCode('VEN', codes.map((c) => c.code));
    this.checkCode(codes, code);
    await this.checkLinks(user, input);
    const creditDays = this.days(input.paymentTerms, input.creditDays, 30);
    const { contactPerson, bankName, iban, ...vendor } = input;
    const id = await this.unitOfWork.run(actorContext(user, meta), async () => {
      const vid = await this.store.save({ ...vendor, code, creditDays, status: 'ACTIVE', bankName, iban });
      if (contactPerson) await this.store.saveContact({ vendorId: vid, fullName: contactPerson, phone: input.phone, email: input.email, isPrimary: true });
      if (bankName) await this.store.saveBank({ vendorId: vid, bankName, iban, currencyCode: input.currencyCode, isPrimary: true });
      return vid;
    });
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: VendorUpdate): Promise<VendorDetail> {
    const v = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== v.code) this.checkCode(await this.store.allCodes(user.tenantId), input.code);
    await this.checkLinks(user, input);
    const body: Record<string, unknown> = { ...input, id };
    if (input.paymentTerms || input.creditDays !== undefined) body.creditDays = this.days(input.paymentTerms ?? v.paymentTerms, input.creditDays, v.creditDays);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(body));
    return this.get(user, id);
  }

  async setActive(user: SessionUser, meta: RequestMeta, id: string, active: boolean, rowVersion: number): Promise<VendorDetail> {
    await this.current(user, id, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion, status: active ? 'ACTIVE' : 'INACTIVE' }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Documents use this vendor. Deactivate it instead.', undefined, { code: 'VENDOR_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- contacts
  async addContact(user: SessionUser, meta: RequestMeta, vendorId: string, input: VendorContactCreate): Promise<VendorDetail> {
    const v = await this.get(user, vendorId);
    const isPrimary = input.isPrimary || v.contacts.length === 0;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isPrimary) await this.clearPrimaryContact(v);
      await this.store.saveContact({ ...input, isPrimary, vendorId });
    });
    return this.get(user, vendorId);
  }

  async updateContact(user: SessionUser, meta: RequestMeta, contactId: string, input: VendorContactUpdate): Promise<VendorDetail> {
    const owner = await this.child(user, 'contact', contactId, input.rowVersion);
    const v = await this.get(user, owner.vendorId);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary) await this.clearPrimaryContact(v, contactId);
      await this.store.saveContact({ ...input, id: contactId });
    });
    return this.get(user, owner.vendorId);
  }

  async deleteContact(user: SessionUser, meta: RequestMeta, contactId: string, rowVersion: number): Promise<void> {
    await this.child(user, 'contact', contactId, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteContact(user.tenantId, contactId, rowVersion));
  }

  // ---------------------------------------------------------------- bank accounts
  async addBank(user: SessionUser, meta: RequestMeta, vendorId: string, input: VendorBankCreate): Promise<VendorDetail> {
    const v = await this.get(user, vendorId);
    await this.checkCurrency(input.currencyCode);
    const isPrimary = input.isPrimary || v.bankAccounts.length === 0;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isPrimary) await this.clearPrimaryBank(v);
      await this.store.saveBank({ ...input, isPrimary, vendorId });
      await this.mirrorPrimaryBank(user, vendorId);
    });
    return this.get(user, vendorId);
  }

  async updateBank(user: SessionUser, meta: RequestMeta, bankId: string, input: VendorBankUpdate): Promise<VendorDetail> {
    const owner = await this.child(user, 'bank', bankId, input.rowVersion);
    if (input.currencyCode) await this.checkCurrency(input.currencyCode);
    const v = await this.get(user, owner.vendorId);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary) await this.clearPrimaryBank(v, bankId);
      await this.store.saveBank({ ...input, id: bankId });
      await this.mirrorPrimaryBank(user, owner.vendorId);
    });
    return this.get(user, owner.vendorId);
  }

  async deleteBank(user: SessionUser, meta: RequestMeta, bankId: string, rowVersion: number): Promise<void> {
    const owner = await this.child(user, 'bank', bankId, rowVersion);
    if (await this.store.bankInUse(bankId)) throw new ConflictError('Payments use this bank account. Deactivate it instead.', undefined, { code: 'VENDOR_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      await this.store.softDeleteBank(user.tenantId, bankId, rowVersion);
      await this.mirrorPrimaryBank(user, owner.vendorId);
    });
  }

  // ---------------------------------------------------------------- helpers
  /** Inside the unit of work: the vendor row's bank / IBAN follow its primary active bank account (non-PK IBANs → empty). */
  private async mirrorPrimaryBank(user: SessionUser, vendorId: string) {
    const v = await this.get(user, vendorId);
    const p = v.bankAccounts.find((b) => b.isPrimary && b.isActive);
    const bankName = p?.bankName ?? null;
    const iban = p?.iban && PK_IBAN.test(p.iban) ? p.iban : null;
    if (bankName !== v.bankName || iban !== v.iban) await this.store.save({ id: vendorId, rowVersion: v.rowVersion, bankName, iban });
  }

  private async clearPrimaryContact(v: VendorDetail, exceptId?: string) {
    for (const c of v.contacts.filter((x) => x.isPrimary && x.id !== exceptId)) await this.store.saveContact({ id: c.id, rowVersion: c.rowVersion, isPrimary: false });
  }

  private async clearPrimaryBank(v: VendorDetail, exceptId?: string) {
    for (const b of v.bankAccounts.filter((x) => x.isPrimary && x.id !== exceptId)) await this.store.saveBank({ id: b.id, rowVersion: b.rowVersion, isPrimary: false });
  }

  /** Advance / on-receipt terms carry no credit days (vendorTermsDaysChk); NET_n defaults to n days. */
  private days(terms: string, given: number | undefined, fallback: number) {
    const implied = termsDays(terms);
    if (implied === 0 && given) throw new ValidationError('Advance and on-receipt terms have no credit days', { creditDays: ['Must be 0 for these terms'] });
    return given ?? implied ?? fallback;
  }

  private async child(user: SessionUser, kind: 'contact' | 'bank', id: string, rowVersion: number) {
    const owner = await this.store.childOwner(user.tenantId, kind, id);
    const what = kind === 'bank' ? 'bank account' : 'contact';
    if (!owner) throw new NotFoundError(`${what[0]!.toUpperCase()}${what.slice(1)} not found`);
    if (owner.rowVersion !== rowVersion) throw new ConcurrencyError(`Someone else changed this ${what}. Reload and try again.`);
    return owner;
  }

  private async checkCurrency(code: string) {
    if (!(await this.store.activeCurrency(code))) throw new ValidationError('Choose an active currency', { currencyCode: ['Unknown or inactive currency'] });
  }

  private async checkLinks(user: SessionUser, l: Links) {
    if (l.categoryId && !(await this.store.activeCategory(user.tenantId, l.categoryId))) {
      throw new ValidationError('Choose an active vendor category', { categoryId: ['Unknown or inactive category'] });
    }
    if (l.currencyCode) await this.checkCurrency(l.currencyCode);
    if (l.defaultAccountId) await this.gl.postable(user, l.defaultAccountId, 'defaultAccountId', [1, 5]);
    if (l.payableAccountId) await this.gl.postable(user, l.payableAccountId, 'payableAccountId', [2]);
  }

  private checkCode(codes: { code: string; deleted: boolean }[], code: string) {
    const hit = codes.find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted vendor and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const v = await this.get(user, id);
    if (v.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this vendor. Reload and try again.');
    return v;
  }
}
