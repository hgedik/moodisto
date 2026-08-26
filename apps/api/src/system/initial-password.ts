import type { TokenGenerator } from '../application/ports';

/** 12 random bytes render as 16 base64url characters — comfortably past the login schema's floor. */
const PASSWORD_BYTE_LENGTH = 12;

/**
 * The password a freshly provisioned account starts with.
 *
 * It is shown once, in the response that created the account, and only its argon2id hash is
 * stored — so it has to be unguessable rather than memorable, and safe to read aloud or paste.
 */
export const generateInitialPassword = (tokens: TokenGenerator): string =>
  tokens.generate(PASSWORD_BYTE_LENGTH);
