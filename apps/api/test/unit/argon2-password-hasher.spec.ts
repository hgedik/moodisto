import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../src/infrastructure/services/argon2-password-hasher';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const hash = await hasher.hash('moodisto-dev-2026');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('moodisto-dev-2026');
  }, 20_000);

  it('salts every hash, so the same password hashes differently', async () => {
    const [first, second] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);
    expect(first).not.toBe(second);
  }, 20_000);

  it('verifies the correct password and refuses a wrong one', async () => {
    const hash = await hasher.hash('moodisto-dev-2026');

    expect(await hasher.verify(hash, 'moodisto-dev-2026')).toBe(true);
    expect(await hasher.verify(hash, 'moodisto-dev-2027')).toBe(false);
  }, 20_000);

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});
