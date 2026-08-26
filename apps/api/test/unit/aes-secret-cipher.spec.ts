import { describe, expect, it } from 'vitest';
import { AesSecretCipher } from '../../src/infrastructure/services/aes-secret-cipher';

const KEY = 'settings-encryption-key-32-chars!!';

describe('secret encryption at rest', () => {
  const cipher = new AesSecretCipher(KEY);

  it('gives the plain text back', () => {
    expect(cipher.decrypt(cipher.encrypt('AIzaSyExampleYoutubeKey'))).toBe(
      'AIzaSyExampleYoutubeKey',
    );
  });

  it('never stores the plain text and never repeats a ciphertext', () => {
    const first = cipher.encrypt('AIzaSyExampleYoutubeKey');
    const second = cipher.encrypt('AIzaSyExampleYoutubeKey');

    expect(first).not.toContain('AIzaSy');
    expect(first).not.toBe(second);
    expect(cipher.decrypt(second)).toBe('AIzaSyExampleYoutubeKey');
  });

  it('refuses a ciphertext that was tampered with', () => {
    const encrypted = cipher.encrypt('AIzaSyExampleYoutubeKey');
    const bytes = Buffer.from(encrypted, 'base64');
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;

    expect(() => cipher.decrypt(bytes.toString('base64'))).toThrow();
  });

  it('refuses a ciphertext written under another key', () => {
    const other = new AesSecretCipher('another-settings-key-32-chars!!!!');

    expect(() => other.decrypt(cipher.encrypt('AIzaSyExampleYoutubeKey'))).toThrow();
  });

  it('refuses text that is not a ciphertext at all', () => {
    expect(() => cipher.decrypt('not-base64-at-all')).toThrow();
    expect(() => cipher.decrypt('')).toThrow();
  });

  it('handles the full unicode range a credential may contain', () => {
    const value = 'şifre-çğüöİ-🎵';
    expect(cipher.decrypt(cipher.encrypt(value))).toBe(value);
  });
});
