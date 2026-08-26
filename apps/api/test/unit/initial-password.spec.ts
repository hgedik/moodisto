import { describe, expect, it } from 'vitest';
import { venueLoginSchema } from '@moodisto/validation';
import { generateInitialPassword } from '../../src/system/initial-password';
import { CryptoTokenGenerator } from '../../src/infrastructure/services/crypto-token-generator';

const tokens = new CryptoTokenGenerator();

/**
 * The operator never chooses this password and sees it exactly once, so it has to be strong enough
 * to survive being e-mailed to a café owner and simple enough to be typed by hand.
 */
describe('generateInitialPassword', () => {
  it('is long enough for the login schema to accept it', () => {
    expect(venueLoginSchema.shape.password.safeParse(generateInitialPassword(tokens)).success).toBe(
      true,
    );
  });

  it('stays inside the url-safe alphabet so it survives copy and paste', () => {
    expect(generateInitialPassword(tokens)).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('never repeats a password', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateInitialPassword(tokens)));

    expect(passwords.size).toBe(50);
  });
});
