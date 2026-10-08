import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { FlagEnvironment, FlagSdkKey } from '../../../../../shared/index.js';
import type { FlagSdkKeys } from '../../../../generated/prisma/client.js';
import { addUpdate } from '../../../../infrastructure/prisma/add-update.js';
import { PrismaService } from '../../../../infrastructure/prisma/prisma.service.js';
import { SdkKeyMinter, SdkKeyStore, type MintedKey } from '../application/sdk-key-store.js';

const toKey = (r: FlagSdkKeys): FlagSdkKey => ({
  id: r.id, environment: r.environment as FlagEnvironment, kind: r.kind, keyPrefix: r.keyPrefix, keyLast4: r.keyLast4, clientId: r.clientId,
  status: r.status, validUntil: r.validUntil?.toISOString() ?? null, rotatedFromId: r.rotatedFromId, createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(), rowVersion: r.rowVersion,
});

@Injectable()
export class PrismaSdkKeyStore extends SdkKeyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(all: boolean) {
    const rows = await this.prisma.db().flagSdkKeys.findMany({ where: all ? {} : { status: { not: 'REVOKED' } }, orderBy: { createdAt: 'desc' } });
    return rows.map(toKey);
  }

  async get(id: string) {
    const r = await this.prisma.db().flagSdkKeys.findUnique({ where: { id } });
    return r ? toKey(r) : null;
  }

  async active(environment: string, kind: string) {
    const r = await this.prisma.db().flagSdkKeys.findFirst({ where: { environment, kind, status: 'ACTIVE' } });
    return r ? toKey(r) : null;
  }

  save(data: Record<string, unknown>) {
    return addUpdate(this.prisma, 'flagSdkKeyAddUpdate', data);
  }
}

/**
 * Keys in the template's shapes: server "sdk-prod-xxxxxxxx-xxxx-xxxxxxxxxxxx", mobile "mob-…", client a 24-hex ID.
 * Server and mobile keys are secrets: only their SHA-256 is stored. Client IDs are public and stored as is.
 */
@Injectable()
export class CryptoSdkKeyMinter extends SdkKeyMinter {
  mint(environment: string, kind: string): MintedKey {
    const hex = randomBytes(16).toString('hex');
    const env = environment.toLowerCase().slice(0, 4);
    if (kind === 'CLIENT') {
      const id = hex.slice(0, 24);
      return { secret: id, keyPrefix: id.slice(0, 4), keyLast4: id.slice(-4), keyHash: null, clientId: id };
    }
    const prefix = `${kind === 'MOBILE' ? 'mob' : 'sdk'}-${env}-`;
    const secret = `${prefix}${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 32)}`;
    return { secret, keyPrefix: prefix, keyLast4: secret.slice(-4), keyHash: createHash('sha256').update(secret).digest('hex'), clientId: null };
  }
}
