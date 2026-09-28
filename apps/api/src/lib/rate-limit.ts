import { apiError } from './http';

// Fixed-window rate limiting keyed on client address (README, Rate limiting). Pure apart from the
// injected clock, so every rule can be tested without waiting a minute.

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

export type LimitDecision =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

type Window = { startedAt: number; count: number };

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();
  private lastSweep: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.lastSweep = now();
  }

  /** Counts one request from `key` and says whether it may go ahead. */
  hit(key: string): LimitDecision {
    const now = this.now();
    this.sweep(now);

    let window = this.windows.get(key);
    if (window === undefined || now - window.startedAt >= this.windowMs) {
      window = { startedAt: now, count: 0 };
      this.windows.set(key, window);
    }

    if (window.count >= this.limit) {
      const msLeft = window.startedAt + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)) };
    }
    window.count += 1;
    return { allowed: true, remaining: this.limit - window.count };
  }

  /** How many addresses are being tracked; lets tests check that old ones are forgotten. */
  get size(): number {
    return this.windows.size;
  }

  // Forget finished windows once per window length, so memory stays proportional to the
  // addresses seen recently rather than every address ever seen.
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
    this.lastSweep = now;
  }
}

/**
 * A request gate for `proxy.ts`: `undefined` lets the request through, a Response refuses it with
 * 429 and Retry-After in the usual error envelope.
 */
export function createRateLimiter(
  config: { limit: number; windowSeconds: number; trustedProxies: number },
  now: () => number = Date.now,
): (req: Request) => Response | undefined {
  const limiter = new FixedWindowLimiter(config.limit, config.windowSeconds * 1000, now);
  return (req) => {
    const address = clientAddress(req.headers.get('x-forwarded-for'), config.trustedProxies);
    const decision = limiter.hit(address);
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
