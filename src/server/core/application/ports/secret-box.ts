/** A sealed secret: ciphertext plus what is needed to open it (all base64). */
export type Sealed = { ciphertext: string; iv: string; authTag: string; keyVersion: number };

/** Encrypts / decrypts tenant secrets with a key kept outside the database. */
export abstract class SecretBox {
  abstract seal(plain: string): Sealed;
  abstract open(sealed: Sealed): string;
}
