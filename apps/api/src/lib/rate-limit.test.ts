import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimitConfig } from '@/config/rate-limit';
import {
  clientAddress,
  createRateLimiter,
  decide,
  UNKNOWN_CLIENT,
  type RateLimitStore,
} from './rate-limit';

const logError = vi.fn();
vi.mock('./log', () => ({ log: { error: (...args: unknown[]) => logError(...args) } }));

beforeEach(() => {
  logError.mockReset();
});

describe('clientAddress', () => {
  it('takes the address the nearest trusted proxy appended', () => {
    expect(clientAddress('203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('ignores whatever the client wrote before it', () => {
    expect(clientAddress('1.1.1.1, 2.2.2.2, 203.0.113.7', 1)).toBe('203.0.113.7');
  });

  it('counts further back when there are more trusted proxies', () => {
    expect(clientAddress('1.1.1.1, 203.0.113.7, 10.0.0.2', 2)).toBe('203.0.113.7');
  });

  it('tolerates spacing and empty entries', () => {
    expect(clientAddress(' 1.1.1.1 ,, 203.0.113.7 ', 1)).toBe('203.0.113.7');
  });

  it.each([
    ['no header', null, 1],
    ['an empty header', '', 1],
    ['fewer entries than trusted proxies', '203.0.113.7', 2],
    ['no trusted proxies', '203.0.113.7', 0],
  ])('falls back to the shared unknown bucket with %s', (_label, header, proxies) => {
    expect(clientAddress(header, proxies)).toBe(UNKNOWN_CLIENT);
  });
});

describe('decide', () => {
  it('allows up to and including the limit', () => {
    expect(decide({ count: 1, retryAfterMs: 59_000 }, 100)).toEqual({ allowed: true });
    expect(decide({ count: 100, retryAfterMs: 1_000 }, 100)).toEqual({ allowed: true });
  });

  it('refuses the request after the limit, saying how many whole seconds remain', () => {
    expect(decide({ count: 101, retryAfterMs: 23_500 }, 100)).toEqual({
      allowed: false,
      retryAfterSeconds: 24,
    });
  });

  it.each([500, 1, 0, -20])('never says to wait less than 1 second (%i ms left)', (ms) => {
    expect(decide({ count: 101, retryAfterMs: ms }, 100)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });
});

describe('createRateLimiter', () => {
  const config = { limit: 2, windowSeconds: 60, trustedProxies: 1 };
  const from = (xff: string) =>
    new Request('http://localhost/api/v1/restaurants', { headers: { 'x-forwarded-for': xff } });

  function storeReturning(count: number, retryAfterMs = 45_000) {
    const hit = vi.fn<RateLimitStore['hit']>().mockResolvedValue({ count, retryAfterMs });
    return { hit };
  }

  it('counts the request under the trusted client address and window length', async () => {
    const store = storeReturning(1);

    await createRateLimiter(config, store)(from('forged, 203.0.113.7'));

    expect(store.hit).toHaveBeenCalledExactlyOnceWith('203.0.113.7', 60);
  });

  it('lets a request within the limit through', async () => {
    expect(await createRateLimiter(config, storeReturning(2))(from('203.0.113.7'))).toBeUndefined();
  });

  it('answers a request over the limit with 429, Retry-After and the error envelope', async () => {
    const refused = await createRateLimiter(config, storeReturning(3))(from('203.0.113.7'));

    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('retry-after')).toBe('45');
    expect(await refused?.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests; try again in 45 seconds' },
    });
  });

  it('says "1 second", not "1 seconds"', async () => {
    const refused = await createRateLimiter(config, storeReturning(3, 400))(from('203.0.113.7'));
    if (refused === undefined) throw new Error('expected a 429');

    expect((await refused.json()).error.message).toBe('Too many requests; try again in 1 second');
  });

  it('lets the request through and logs when the store fails', async () => {
    const store = { hit: vi.fn<RateLimitStore['hit']>().mockRejectedValue(new Error('db down')) };

    expect(await createRateLimiter(config, store)(from('203.0.113.7'))).toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });

  it('uses the numbers from the config file', () => {
    expect(rateLimitConfig).toEqual({ limit: 100, windowSeconds: 60, trustedProxies: 1 });
  });
});
