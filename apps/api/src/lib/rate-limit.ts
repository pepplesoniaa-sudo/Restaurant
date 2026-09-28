import { apiError } from './http';
import { log } from './log';

// Fixed-window rate limiting keyed on client address (README, Rate limiting). The counting lives
// in a store (PostgreSQL in production, see rate-limit-store.ts); what to do with a count is
// decided here, by pure functions.

/** Used when no trustworthy address can be found: such callers share one budget. */
export const UNKNOWN_CLIENT = 'unknown';

/**
 * The client address from X-Forwarded-For, counting `trustedProxies` entries from the end. Each
 * trusted proxy appends the address it saw, so entries further left were written by the client
 * and could be forged.
 */
export function clientAddress(forwardedFor: string | null, trustedProxies: number): string {
  if (forwardedFor === null || trustedProxies < 1) return UNKNOWN_CLIENT;
  const entries = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries[entries.length - trustedProxies] ?? UNKNOWN_CLIENT;
}

/** A client's position in its current window, after counting the request just made. */
export type WindowCount = { count: number; retryAfterMs: number };

export type RateLimitStore = {
  /** Counts one request from `key` and returns its window's state. */
  hit(key: string, windowSeconds: number): Promise<WindowCount>;
};

export type LimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function decide(window: WindowCount, limit: number): LimitDecision {
  if (window.count <= limit) return { allowed: true };
  // Whole seconds, rounded up, never 0: "try again in 0 seconds" would invite an instant retry.
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(window.retryAfterMs / 1000)) };
}

/**
 * A request gate for `proxy.ts`: `undefined` lets the request through, a Response refuses it with
 * 429 and Retry-After in the usual error envelope. If the store fails, the request is let through
 * and the failure logged: every route needs the database anyway (README, Rate limiting).
 */
export function createRateLimiter(
  config: { limit: number; windowSeconds: number; trustedProxies: number },
  store: RateLimitStore,
): (req: Request) => Promise<Response | undefined> {
  return async (req) => {
    const address = clientAddress(req.headers.get('x-forwarded-for'), config.trustedProxies);
    let window: WindowCount;
    try {
      window = await store.hit(address, config.windowSeconds);
    } catch (err) {
      log.error('rate limit check failed; letting the request through', { err });
      return undefined;
    }

    const decision = decide(window, config.limit);
    if (decision.allowed) return undefined;
    const wait = decision.retryAfterSeconds;
    return apiError(
      429,
      'RATE_LIMITED',
      `Too many requests; try again in ${wait} second${wait === 1 ? '' : 's'}`,
      { 'Retry-After': String(wait) },
    );
  };
}
