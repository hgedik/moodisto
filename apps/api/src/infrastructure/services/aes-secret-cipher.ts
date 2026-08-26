import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SecretCipher } from '../../application/ports';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_INFO = 'moodisto:system-settings';

/**
 * AES-256-GCM, so a stored credential is both unreadable and unforgeable: any edit to the
 * ciphertext fails authentication instead of decrypting to something else.
 *
 * The configured key is stretched with HKDF rather than used verbatim, so an operator may pick a
 * passphrase of any length without weakening the cipher.
 */
@Injectable()
export class AesSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', Buffer.from(encryptionKey, 'utf8'), Buffer.alloc(0), HKDF_INFO, KEY_BYTES),
    );
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }

  decrypt(cipherText: string): string {
    const raw = Buffer.from(cipherText, 'base64');
    if (raw.length <= IV_BYTES + TAG_BYTES) {
      throw new Error('Şifreli ayar değeri okunamadı.');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }
}
