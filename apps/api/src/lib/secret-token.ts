import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Long random bearer secrets: staff keys and order tracking tokens. Each kind has its own prefix,
// so one can never be mistaken for the other. Only a SHA-256 hash is ever stored; a fast hash is
// enough because the input is 256 random bits, not a human-chosen password.

const BODY = '[A-Za-z0-9_-]{43}';

export function generateToken(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The token from an `Authorization: Bearer <token>` header, if it is a well-formed `prefix` token. */
export function parseBearerToken(authorization: string | null, prefix: string): string | null {
  const match = /^Bearer (\S+)$/.exec(authorization ?? '');
  const token = match?.[1];
  return token !== undefined && new RegExp(`^${prefix}${BODY}$`).test(token) ? token : null;
}

/** Whether `token` hashes to `storedHash`, compared in constant time. */
export function matchesHash(token: string, storedHash: string | null): boolean {
  if (storedHash === null) return false;
  const actual = Buffer.from(hashToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
