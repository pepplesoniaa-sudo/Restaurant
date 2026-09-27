import { generateToken, parseBearerToken } from './secret-token';

// Order tracking tokens (README, Tracking an order).

const PREFIX = 'otk_';

export function generateTrackingToken(): string {
  return generateToken(PREFIX);
}

/** The token from an `Authorization: Bearer <token>` header, or null if it isn't a tracking token. */
export function parseTrackingToken(authorization: string | null): string | null {
  return parseBearerToken(authorization, PREFIX);
}
