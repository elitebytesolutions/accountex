import { Injectable } from '@nestjs/common';
import type { AdminSession, FlagSdkKeyCreate, FlagSdkKeyIssued } from '../../../../../shared/index.js';
import { adminActorContext } from '../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../core/domain/errors.js';
import { SdkKeyMinter, SdkKeyStore } from './sdk-key-store.js';

/** Rotation keeps the old key working for this long (template: "The old one keeps working for 24 hours"). */
const GRACE_MS = 24 * 3600_000;

/** SDK keys per environment and kind (one ACTIVE each). Secrets are shown once; only a hash is stored. */
@Injectable()
export class SdkKeysService {
  constructor(
    private readonly store: SdkKeyStore,
    private readonly minter: SdkKeyMinter,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  list(all: boolean) {
    return this.store.list(all);
  }

  async create(admin: AdminSession, meta: RequestMeta, input: FlagSdkKeyCreate): Promise<FlagSdkKeyIssued> {
    const staff = staffOf(admin);
    if (await this.store.active(input.environment, input.kind)) throw new ConflictError('This environment already has an active key of this kind. Rotate it instead.');
    const m = this.minter.mint(input.environment, input.kind);
    const id = await this.unitOfWork.run(adminActorContext(admin, meta), () =>
      this.store.save({ environment: input.environment, kind: input.kind, keyPrefix: m.keyPrefix, keyHash: m.keyHash, clientId: m.clientId, keyLast4: m.keyLast4, status: 'ACTIVE', rotatedByStaffId: staff }));
    return { key: (await this.store.get(id))!, secret: m.secret };
  }

  /** Issues a new ACTIVE key; the old one goes to GRACE for 24 hours. */
  async rotate(admin: AdminSession, meta: RequestMeta, id: string): Promise<FlagSdkKeyIssued> {
    const staff = staffOf(admin);
    const cur = await this.store.get(id);
    if (!cur) throw new NotFoundError('SDK key not found');
    if (cur.status === 'REVOKED') throw new ConflictError('This SDK key is already revoked.', undefined, { code: 'FLAG_SDK_KEY_REVOKED' });
    if (cur.status !== 'ACTIVE') throw new ConflictError('Only the active key can be rotated.');
    const m = this.minter.mint(cur.environment, cur.kind);
    const newId = await this.unitOfWork.run(adminActorContext(admin, meta), async () => {
      await this.store.save({ id, rowVersion: cur.rowVersion, status: 'GRACE', validUntil: new Date(Date.now() + GRACE_MS).toISOString() });
      return this.store.save({
        environment: cur.environment, kind: cur.kind, keyPrefix: m.keyPrefix, keyHash: m.keyHash, clientId: m.clientId, keyLast4: m.keyLast4,
        status: 'ACTIVE', rotatedFromId: id, rotatedByStaffId: staff,
      });
    });
    return { key: (await this.store.get(newId))!, secret: m.secret };
  }

  async revoke(admin: AdminSession, meta: RequestMeta, id: string) {
    staffOf(admin);
    const cur = await this.store.get(id);
    if (!cur) throw new NotFoundError('SDK key not found');
    if (cur.status === 'REVOKED') throw new ConflictError('This SDK key is already revoked.', undefined, { code: 'FLAG_SDK_KEY_REVOKED' });
    await this.unitOfWork.run(adminActorContext(admin, meta), () => this.store.save({ id, rowVersion: cur.rowVersion, status: 'REVOKED' }));
    return (await this.store.get(id))!;
  }
}

function staffOf(admin: AdminSession): string {
  if (!admin.staffId) throw new ForbiddenError('Your admin account has no platform staff record yet. Sign in again.');
  return admin.staffId;
}
