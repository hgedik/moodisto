import { createHmac, timingSafeEqual } from 'node:crypto';

export const hmacSha256Hex = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

/** Constant-time comparison so a webhook forger cannot probe the signature byte by byte. */
export const signaturesMatch = (expected: string, received: string): boolean => {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};
