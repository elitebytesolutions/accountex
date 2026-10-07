import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SecretBox, type Sealed } from '../../core/application/ports/secret-box.js';
import { env } from '../config/env.js';

/** AES-256-GCM with APP_ENCRYPTION_KEY (key version 1); a fresh 12-byte IV per secret. */
@Injectable()
export class AesGcmSecretBox extends SecretBox {
  private readonly key = Buffer.from(env.APP_ENCRYPTION_KEY, 'base64');

  seal(plain: string): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: 1 };
  }

  open(sealed: Sealed): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }
}
