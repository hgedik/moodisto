import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, signaturesMatch } from '../../src/payments/signature';

describe('payment signatures', () => {
  it('produces the documented HMAC-SHA256 hex digest', () => {
    expect(hmacSha256Hex('secret', 'payload')).toBe(
      'b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4',
    );
  });

  it('changes when either the secret or the payload changes', () => {
    const base = hmacSha256Hex('secret', 'payload');
    expect(hmacSha256Hex('other', 'payload')).not.toBe(base);
    expect(hmacSha256Hex('secret', 'payload!')).not.toBe(base);
  });

  it('accepts an identical signature', () => {
    const signature = hmacSha256Hex('secret', 'payload');
    expect(signaturesMatch(signature, signature)).toBe(true);
  });

  it('rejects a different signature of the same length', () => {
    const signature = hmacSha256Hex('secret', 'payload');
    const forged = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`;
    expect(signaturesMatch(signature, forged)).toBe(false);
  });

  it('rejects a signature of a different length instead of throwing', () => {
    expect(signaturesMatch(hmacSha256Hex('secret', 'payload'), 'short')).toBe(false);
    expect(signaturesMatch(hmacSha256Hex('secret', 'payload'), '')).toBe(false);
  });
});
