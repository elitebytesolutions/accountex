import { Injectable } from '@nestjs/common';
import {
  termsDays,
  type CustomerAddressCreate,
  type CustomerAddressUpdate,
  type CustomerContactCreate,
  type CustomerContactUpdate,
  type CustomerCreate,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerStatusChange,
  type CustomerUpdate,
  type SessionUser,
} from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../core/domain/errors.js';
import { GlLinks } from '../../../treasury/gl-links/application/gl-links.js';
import { nextPartyCode } from '../../domain/codes.js';
import { CustomerStore } from './customer-store.js';

type Links = { customerGroupId?: string | null; priceListId?: string | null; branchId?: string | null; salesRepUserId?: string | null; receivableAccountId?: string | null };

/**
 * Customers with their contacts, addresses and notes. One primary contact per customer and one default address per
 * type: setting a new one moves the flag in the same unit of work. ON_HOLD needs a reason; notes carry their author.
 */
@Injectable()
export class CustomersService {
  constructor(
    private readonly store: CustomerStore,
    private readonly gl: GlLinks,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(user: SessionUser, q: CustomerListQuery) {
    return this.store.page(user.tenantId, q);
  }

  summary(user: SessionUser) {
    return this.store.summary(user.tenantId);
  }

  formOptions(user: SessionUser) {
    return this.store.formOptions(user.tenantId);
  }

  async get(user: SessionUser, id: string): Promise<CustomerDetail> {
    const c = await this.store.detail(user.tenantId, id);
    if (!c) throw new NotFoundError('Customer not found');
    return c;
  }

  async create(user: SessionUser, meta: RequestMeta, input: CustomerCreate): Promise<CustomerDetail> {
    const codes = await this.store.allCodes(user.tenantId);
    const code = input.code ?? nextPartyCode('CUST', codes.map((c) => c.code));
    this.checkCode(codes, code);
    await this.checkLinks(user, input);
    const creditDays = input.creditDays ?? termsDays(input.paymentTerms) ?? 30;
    const id = await this.unitOfWork.run(actorContext(user, meta), () =>
      this.store.save({ ...input, code, creditDays, shippingAddress: input.shippingSameAsBilling ? null : input.shippingAddress, status: 'ACTIVE' }),
    );
    return this.get(user, id);
  }

  async update(user: SessionUser, meta: RequestMeta, id: string, input: CustomerUpdate): Promise<CustomerDetail> {
    const c = await this.current(user, id, input.rowVersion);
    if (input.code && input.code !== c.code) this.checkCode(await this.store.allCodes(user.tenantId), input.code);
    await this.checkLinks(user, input);
    const body: Record<string, unknown> = { ...input, id };
    if (input.paymentTerms && input.creditDays === undefined) body.creditDays = termsDays(input.paymentTerms) ?? c.creditDays;
    if (input.shippingSameAsBilling) body.shippingAddress = null;
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save(body));
    return this.get(user, id);
  }

  /** ACTIVE / ON_HOLD (with a reason; stamps onHoldSince) / DISPUTED / INACTIVE. */
  async setStatus(user: SessionUser, meta: RequestMeta, id: string, input: CustomerStatusChange): Promise<CustomerDetail> {
    const c = await this.current(user, id, input.rowVersion);
    if (input.status === 'ON_HOLD' && !input.holdReason) {
      throw new ValidationError('Choose why the customer is on hold', { holdReason: ['Choose a reason'] }, { code: 'CUSTOMER_HOLD_REASON_REQUIRED' });
    }
    const hold = input.status === 'ON_HOLD'
      ? { holdReason: input.holdReason, onHoldSince: c.status === 'ON_HOLD' && c.onHoldSince ? c.onHoldSince : new Date().toISOString() }
      : { holdReason: null, onHoldSince: null };
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.save({ id, rowVersion: input.rowVersion, status: input.status, ...hold }));
    return this.get(user, id);
  }

  async delete(user: SessionUser, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(user, id, rowVersion);
    if (await this.store.inUse(id)) throw new ConflictError('Documents use this customer. Deactivate it instead.', undefined, { code: 'CUSTOMER_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDelete(user.tenantId, id, rowVersion));
  }

  // ---------------------------------------------------------------- contacts
  async addContact(user: SessionUser, meta: RequestMeta, customerId: string, input: CustomerContactCreate): Promise<CustomerDetail> {
    const c = await this.get(user, customerId);
    const isPrimary = input.isPrimary || c.contacts.length === 0;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isPrimary) await this.clearPrimary(c);
      await this.store.saveContact({ ...input, isPrimary, customerId });
    });
    return this.get(user, customerId);
  }

  async updateContact(user: SessionUser, meta: RequestMeta, contactId: string, input: CustomerContactUpdate): Promise<CustomerDetail> {
    const owner = await this.child(user, 'contact', contactId, input.rowVersion);
    const c = await this.get(user, owner.customerId);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isPrimary) await this.clearPrimary(c, contactId);
      await this.store.saveContact({ ...input, id: contactId });
    });
    return this.get(user, owner.customerId);
  }

  async deleteContact(user: SessionUser, meta: RequestMeta, contactId: string, rowVersion: number): Promise<void> {
    await this.child(user, 'contact', contactId, rowVersion);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteContact(user.tenantId, contactId, rowVersion));
  }

  // ---------------------------------------------------------------- addresses
  async addAddress(user: SessionUser, meta: RequestMeta, customerId: string, input: CustomerAddressCreate): Promise<CustomerDetail> {
    const c = await this.get(user, customerId);
    const isDefault = input.isDefault || !c.addresses.some((a) => a.addressType === input.addressType);
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (isDefault) await this.clearDefault(c, input.addressType);
      await this.store.saveAddress({ ...input, isDefault, customerId });
    });
    return this.get(user, customerId);
  }

  async updateAddress(user: SessionUser, meta: RequestMeta, addressId: string, input: CustomerAddressUpdate): Promise<CustomerDetail> {
    const owner = await this.child(user, 'address', addressId, input.rowVersion);
    const c = await this.get(user, owner.customerId);
    const a = c.addresses.find((x) => x.id === addressId)!;
    const type = input.addressType ?? a.addressType;
    await this.unitOfWork.run(actorContext(user, meta), async () => {
      if (input.isDefault || (a.isDefault && type !== a.addressType)) await this.clearDefault(c, type, addressId);
      await this.store.saveAddress({ ...input, id: addressId });
    });
    return this.get(user, owner.customerId);
  }

  async deleteAddress(user: SessionUser, meta: RequestMeta, addressId: string, rowVersion: number): Promise<void> {
    await this.child(user, 'address', addressId, rowVersion);
    if (await this.store.addressInUse(addressId)) throw new ConflictError('Documents use this address.', undefined, { code: 'CUSTOMER_IN_USE' });
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.softDeleteAddress(user.tenantId, addressId, rowVersion));
  }

  // ---------------------------------------------------------------- notes
  async addNote(user: SessionUser, meta: RequestMeta, customerId: string, note: string): Promise<CustomerDetail> {
    await this.get(user, customerId);
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.saveNote({ customerId, note, authorUserId: user.id }));
    return this.get(user, customerId);
  }

  /** Only the author removes a note (row history keeps it). */
  async deleteNote(user: SessionUser, meta: RequestMeta, noteId: string, rowVersion: number): Promise<void> {
    const owner = await this.child(user, 'note', noteId, rowVersion);
    if (owner.authorUserId !== user.id) throw new ForbiddenError('Only the author can delete a note.');
    await this.unitOfWork.run(actorContext(user, meta), () => this.store.deleteNote(user.tenantId, noteId, rowVersion));
  }

  // ---------------------------------------------------------------- helpers
  private async clearPrimary(c: CustomerDetail, exceptId?: string) {
    for (const x of c.contacts.filter((k) => k.isPrimary && k.id !== exceptId)) await this.store.saveContact({ id: x.id, rowVersion: x.rowVersion, isPrimary: false });
  }

  private async clearDefault(c: CustomerDetail, type: string, exceptId?: string) {
    for (const x of c.addresses.filter((a) => a.isDefault && a.addressType === type && a.id !== exceptId)) await this.store.saveAddress({ id: x.id, rowVersion: x.rowVersion, isDefault: false });
  }

  private async child(user: SessionUser, kind: 'contact' | 'address' | 'note', id: string, rowVersion: number) {
    const owner = await this.store.childOwner(user.tenantId, kind, id);
    if (!owner) throw new NotFoundError(`${kind[0]!.toUpperCase()}${kind.slice(1)} not found`);
    if (owner.rowVersion !== rowVersion) throw new ConcurrencyError(`Someone else changed this ${kind}. Reload and try again.`);
    return owner;
  }

  private async checkLinks(user: SessionUser, l: Links) {
    if (l.customerGroupId && !(await this.store.activeGroup(user.tenantId, l.customerGroupId))) {
      throw new ValidationError('Choose an active customer group', { customerGroupId: ['Unknown or inactive group'] });
    }
    if (l.priceListId && !(await this.store.activePriceList(user.tenantId, l.priceListId))) {
      throw new ValidationError('Choose an active price list', { priceListId: ['Unknown or inactive price list'] });
    }
    if (l.branchId && !(await this.store.activeBranch(user.tenantId, l.branchId))) {
      throw new ValidationError('Choose an active branch', { branchId: ['Unknown or inactive branch'] });
    }
    if (l.salesRepUserId && !(await this.store.activeUser(user.tenantId, l.salesRepUserId))) {
      throw new ValidationError('Choose an active user as sales rep', { salesRepUserId: ['Unknown or inactive user'] });
    }
    if (l.receivableAccountId) await this.gl.postable(user, l.receivableAccountId, 'receivableAccountId', [1]);
  }

  private checkCode(codes: { code: string; deleted: boolean }[], code: string) {
    const hit = codes.find((c) => c.code === code);
    if (!hit) return;
    throw hit.deleted
      ? new ConflictError(`Code ${code} belonged to a deleted customer and can't be reused.`, { code: ['Codes are never reused'] }, { code: 'CODE_RETIRED' })
      : new ConflictError(`Code ${code} is already used.`, { code: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
  }

  private async current(user: SessionUser, id: string, rowVersion: number) {
    const c = await this.get(user, id);
    if (c.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this customer. Reload and try again.');
    return c;
  }
}
