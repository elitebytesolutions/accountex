import { Injectable } from '@nestjs/common';
import { FBR_AUTHORITIES, type FbrAuthority, type FbrSetting, type FbrSettingSave, type SessionUser } from '../../../../../shared/index.js';
import { actorContext } from '../../../../core/application/actor-context.js';
import { SecretBox } from '../../../../core/application/ports/secret-box.js';
import { UnitOfWork, type RequestMeta } from '../../../../core/application/ports/unit-of-work.js';
import { ConcurrencyError, ValidationError } from '../../../../core/domain/errors.js';
import { FbrStore } from './fbr-store.js';

const PURPOSE: Record<FbrAuthority, string> = { FBR: 'FBR_API_TOKEN', PRA: 'PRA_API_TOKEN' };

/**
 * FBR / PRA integration settings. The API token is sealed with SecretBox (AES-256-GCM, key outside the database) in
 * Company.TenantSecrets; the API only ever returns whether one is saved and its last 4 characters. Connection tests
 * and invoice sync arrive with FBR Submissions (Phase 28), so the status stays "Not configured" here.
 */
@Injectable()
export class FbrService {
  constructor(
    private readonly store: FbrStore,
    private readonly box: SecretBox,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async get(user: SessionUser): Promise<FbrSetting[]> {
    const [saved, ids] = await Promise.all([this.store.settings(user.tenantId), this.store.companyTaxIds(user.tenantId)]);
    return FBR_AUTHORITIES.map((authority) => saved[authority] ?? {
      authority, id: null, environment: 'SANDBOX', posId: '', ntn: ids.ntn ?? '', strn: ids.strn, hasToken: false, tokenHint: null, tokenExpiresOn: null,
      reportOnPosting: true, printQr: true, blockIfUnreachable: false, syncIntervalMinutes: 5, connectionStatus: 'NOT_CONFIGURED',
      lastHealthCheckAt: null, lastSyncAt: null, isActive: false, mappings: [], rowVersion: null,
    });
  }

  async save(user: SessionUser, meta: RequestMeta, authority: FbrAuthority, input: FbrSettingSave): Promise<FbrSetting> {
    const current = (await this.store.settings(user.tenantId))[authority];
    if (current && input.rowVersion !== current.rowVersion) throw new ConcurrencyError('Someone else changed these settings. Reload and try again.');
    const ids = await this.store.companyTaxIds(user.tenantId);
    if (!ids.ntn) throw new ValidationError('Add the company NTN in Company Settings › Company Profile first', { ntn: ['Company NTN missing'] });
    const branchIds = input.mappings.map((m) => m.branchId).filter((b): b is string => !!b);
    const active = await this.store.activeBranchIds(user.tenantId, branchIds);
    if (branchIds.some((b) => !active.includes(b))) throw new ValidationError('Choose active branches', { mappings: ['Unknown or inactive branch'] });
    const known = new Set(current?.mappings.map((m) => m.id) ?? []);
    if (input.mappings.some((m) => m.id && !known.has(m.id))) throw new ValidationError('Unknown mapping row', { mappings: ['Reload and try again'] });

    await this.unitOfWork.run(actorContext(user, meta), async () => {
      let token: Record<string, unknown> = {};
      if (input.apiToken) {
        const ref = await this.store.putSecret(user.tenantId, PURPOSE[authority], this.box.seal(input.apiToken));
        token = { apiTokenSecretRef: ref, apiTokenHint: input.apiToken.slice(-4) };
      } else if (input.clearToken) {
        await this.store.deleteSecret(user.tenantId, PURPOSE[authority]);
        token = { apiTokenSecretRef: null, apiTokenHint: null };
      }
      const fields = {
        environment: input.environment, posId: input.posId, tokenExpiresOn: input.tokenExpiresOn, reportOnPosting: input.reportOnPosting, printQr: input.printQr,
        blockIfUnreachable: input.blockIfUnreachable, syncIntervalMinutes: input.syncIntervalMinutes, isActive: input.isActive,
      };
      await this.store.save({
        ...(current ? { id: current.id, rowVersion: input.rowVersion } : { authority, connectionStatus: 'NOT_CONFIGURED' }),
        ...fields, ...token, ntn: ids.ntn, strn: ids.strn,
        // Mappings are replaced by id: rows with an id are kept, missing ones removed, new ones inserted.
        branchMappings: input.mappings.map((m) => ({ ...(m.id && { id: m.id }), branchId: m.branchId, posId: m.posId, isActive: m.isActive })),
      });
    });
    return (await this.get(user)).find((s) => s.authority === authority)!;
  }

  /** The decrypted token, for the Phase 28 FBR client. Never exposed through the API. */
  async token(tenantId: string, authority: FbrAuthority): Promise<string | null> {
    const sealed = await this.store.getSecret(tenantId, PURPOSE[authority]);
    return sealed ? this.box.open(sealed) : null;
  }
}
