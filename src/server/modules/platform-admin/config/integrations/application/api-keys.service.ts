import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { API_KEY_ROTATION_GRACE_HOURS, type AdminSession, type ApiKey, type ApiKeyCreate, type ApiKeyWithSecret } from '../../../../../../shared/index.js';
import { adminActorContext } from '../../../../../core/application/admin-actor-context.js';
import { UnitOfWork, type AuditContext, type RequestMeta } from '../../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ConflictError, NotFoundError, ValidationError } from '../../../../../core/domain/errors.js';
import { parseCidr } from '../../security/domain/ip-allowlist.js';
import { apiKeyPrefix, expiresAtFor, newApiKey } from '../domain/credentials.js';
import { ApiKeyStore, type StoredApiKey } from './integration-store.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const strip = (k: StoredApiKey): ApiKey => {
  const out: Partial<StoredApiKey> = { ...k };
  delete out.keyHash;
  return out as ApiKey;
};

/**
 * Per-tenant API keys (System › API & Webhooks). The full key is returned once (create / rotate); only its sha-256 is
 * stored (deterministic, so a request's key can be looked up by hash). Rotation keeps the old key valid for 24 h.
 * Saves run in the Super Admin's audit context with the key's tenant (Platform.platformApiKeyAddUpdate reads app.tenantId).
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly store: ApiKeyStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  tenants() {
    return this.store.tenants();
  }

  async list(tenantId: string) {
    if (!(await this.store.tenantExists(tenantId))) throw new NotFoundError('Tenant not found');
    return this.store.list(tenantId);
  }

  async create(admin: AdminSession, meta: RequestMeta, input: ApiKeyCreate): Promise<ApiKeyWithSecret> {
    if (!(await this.store.tenantExists(input.tenantId))) throw new ValidationError('Choose a tenant', { tenantId: ['Unknown tenant'] });
    const cidrs = input.allowedCidrs.map((c) => parseCidr(c));
    const bad = input.allowedCidrs.find((_, i) => !cidrs[i]);
    if (bad) throw new ValidationError(`“${bad}” is not a valid IPv4 CIDR`, { allowedCidrs: ['IPv4 CIDRs such as 203.99.180.0/24'] });
    const secret = newApiKey(input.environment, randomBytes(32));
    const id = await this.unitOfWork.run(this.context(admin, meta, input.tenantId), () => this.store.save(input.tenantId, {
      name: input.name, environment: input.environment, keyPrefix: apiKeyPrefix(input.environment), keyHash: sha256(secret), keyLast4: secret.slice(-4),
      scopes: input.scopes, allowedCidrs: cidrs.length ? cidrs.map((c) => c!.text) : null, expiresAt: expiresAtFor(input.expiry, new Date()),
      status: 'ACTIVE',
    }));
    return { key: strip((await this.store.get(id))!), secret };
  }

  /** New key now; the old one keeps working for API_KEY_ROTATION_GRACE_HOURS (previousKeyHash / previousValidUntil). */
  async rotate(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<ApiKeyWithSecret> {
    const k = await this.current(id, rowVersion);
    const secret = newApiKey(k.environment, randomBytes(32));
    const now = new Date();
    await this.unitOfWork.run(this.context(admin, meta, k.tenantId), () => this.store.save(k.tenantId, {
      id, rowVersion, keyHash: sha256(secret), keyLast4: secret.slice(-4), previousKeyHash: k.keyHash,
      previousValidUntil: new Date(now.getTime() + API_KEY_ROTATION_GRACE_HOURS * 3_600_000), rotatedAt: now,
    }));
    return { key: strip((await this.store.get(id))!), secret };
  }

  /** Requests with the key (and any rotated-out key) fail at once. */
  async revoke(admin: AdminSession, meta: RequestMeta, id: string, rowVersion: number): Promise<ApiKey> {
    const k = await this.current(id, rowVersion);
    await this.unitOfWork.run(this.context(admin, meta, k.tenantId), () => this.store.save(k.tenantId, {
      id, rowVersion, status: 'REVOKED', revokedAt: new Date(), revokedByStaffId: admin.staffId, previousKeyHash: null, previousValidUntil: null,
    }));
    return strip((await this.store.get(id))!);
  }

  private context(admin: AdminSession, meta: RequestMeta, tenantId: string): AuditContext {
    return { ...adminActorContext(admin, meta), tenantId };
  }

  private async current(id: string, rowVersion: number): Promise<StoredApiKey> {
    const k = await this.store.get(id);
    if (!k) throw new NotFoundError('API key not found');
    if (k.status === 'REVOKED') throw new ConflictError('This API key is already revoked.', undefined, { code: 'API_KEY_REVOKED' });
    if (k.rowVersion !== rowVersion) throw new ConcurrencyError('Someone else changed this key. Reload and try again.');
    return k;
  }
}
