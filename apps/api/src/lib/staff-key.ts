import { generateToken, hashToken, parseBearerToken } from './secret-token';

// Restaurant staff keys (README, Restaurant staff access).

const PREFIX = 'rsk_';

export function generateStaffKey(): string {
  return generateToken(PREFIX);
}

export function hashStaffKey(key: string): string {
  return hashToken(key);
}

/** The key from an `Authorization: Bearer <key>` header, or null if it isn't a well-formed key. */
export function parseStaffKey(authorization: string | null): string | null {
  return parseBearerToken(authorization, PREFIX);
}
