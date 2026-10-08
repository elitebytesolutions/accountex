import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AdminSession, Reseller, ResellerCreate, ResellerUpdate } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { SecretBox } from '../../../../../core/application/ports/secret-box.js';
import { UnitOfWork, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError } from '../../../../../core/domain/errors.js';
import { inviteCodeFrom, maskIban } from '../domain/reseller-rules.js';
import { ResellerStore } from './reseller-store.js';

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Resellers (Super Admin › Growth › Partners & Coupons, Resellers tab). The IBAN is write-only: sealed with SecretBox into
 * ibanEnc (bytea, redacted from history) with a display mask; it is never returned. Payouts and MRR are Phase 41.
 */
@Injectable()
export class ResellersService {
  constructor(
    private readonly store: ResellerStore,
    private readonly secrets: SecretBox,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list() {
    return this.store.list();
  }

  async get(id: string): Promise<Reseller> {
    const r = await this.store.get(id);
    if (!r) throw new NotFoundError('Reseller not found');
    return r;
  }

  async create(admin: AdminSession, meta: RequestMeta, input: ResellerCreate): Promise<Reseller> {
    await this.assertNameFree(input.name, null);
    const { iban, ...fields } = input;
    const inviteCode = await this.newInviteCode();
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...fields, ...this.ibanFields(iban), inviteCode }));
    return this.get(id);
  }

  async update(admin: AdminSession, meta: RequestMeta, id: string, input: ResellerUpdate): Promise<Reseller> {
    const r = await this.current(id, input.rowVersion);
    const { rowVersion, iban, ...rest } = input;
    if (rest.name && rest.name.toLowerCase() !== r.name.toLowerCase()) await this.assertNameFree(rest.name, id);
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ ...defined(rest), ...this.ibanFields(iban), id, rowVersion }));
    return this.get(id);
  }

  async setStatus(admin: AdminSession, meta: RequestMeta, id: string, status: string, rowVersion: number): Promise<Reseller> {
    const r = await this.current(id, rowVersion);
    if (r.status === status) return r;
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, status }));
    return this.get(id);
  }

  /** A new partner invite code; the old link stops working. */
  async regenerateInviteCode(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<Reseller> {
    await this.current(id, rowVersion);
    const inviteCode = await this.newInviteCode();
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion, inviteCode }));
    return this.get(id);
  }

  /** Soft delete of a partner nothing links to; otherwise suspend or terminate it. */
  async delete(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<void> {
    await this.current(id, rowVersion);
    if (await this.store.inUse(id)) {
      throw new ConflictError('Tenants, payouts, leads or coupons are linked to this reseller. Suspend or terminate it instead.', undefined, { code: 'RESELLER_IN_USE' });
    }
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.softDelete(id, rowVersion));
  }

  /** Sealed IBAN as bytea text (\x…) plus its mask; nothing when no new IBAN was typed. */
  private ibanFields(iban: string | undefined) {
    if (!iban) return {};
    const sealed = Buffer.from(JSON.stringify(this.secrets.seal(iban)), 'utf8');
    return { ibanEnc: `\\x${sealed.toString('hex')}`, ibanMasked: maskIban(iban) };
  }

  private async newInviteCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = inviteCodeFrom(randomBytes(8));
      if (!(await this.store.inviteCodeTaken(code))) return code;
    }
    throw new ConflictError('Could not generate a unique invite code. Try again.');
  }

  private async assertNameFree(name: string, id: string | null) {
    const hit = (await this.store.allNames()).find((r) => r.id !== id && r.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) {
      throw new ConflictError(hit.deleted ? `“${name}” belonged to a deleted reseller and can't be reused.` : `A reseller named “${name}” already exists.`,
        { name: ['Already used'] }, { code: 'DB_UNIQUE_VIOLATION' });
    }
  }

  private async current(id: string, rowVersion: number) {
    const r = await this.get(id);
    if (r.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this reseller. Reload and try again.');
    return r;
  }
}
