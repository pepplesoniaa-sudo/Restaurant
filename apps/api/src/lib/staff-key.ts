import { createHash, randomBytes } from 'node:crypto';

// Restaurant staff keys (README, Restaurant staff access). A key is 32 random bytes, so it can't
// be guessed; only its SHA-256 hash is stored. A fast hash is enough here because the input is
// random, not a human-chosen password.

const PREFIX = 'rsk_';
const KEY_PATTERN = /^rsk_[A-Za-z0-9_-]{43}$/;

export function generateStaffKey(): string {
  return PREFIX + randomBytes(32).toString('base64url');
}

export function hashStaffKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** The key from an `Authorization: Bearer <key>` header, or null if it isn't a well-formed key. */
export function parseStaffKey(authorization: string | null): string | null {
  const match = /^Bearer (\S+)$/.exec(authorization ?? '');
  const key = match?.[1];
  return key !== undefined && KEY_PATTERN.test(key) ? key : null;
}
