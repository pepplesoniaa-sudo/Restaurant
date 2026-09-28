import { describe, expect, it } from 'vitest';
import { rateLimitConfig } from '@/config/rate-limit';
import { clientAddress, createRateLimiter, FixedWindowLimiter, UNKNOWN_CLIENT } from './rate-limit';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

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

describe('FixedWindowLimiter', () => {
  it('allows exactly `limit` requests in a window, counting down what is left', () => {
    const limiter = new FixedWindowLimiter(3, 60_000, clock().now);

    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([
      { allowed: true, remaining: 2 },
      { allowed: true, remaining: 1 },
      { allowed: true, remaining: 0 },
    ]);
    expect(limiter.hit('a').allowed).toBe(false);
  });

  it('says how many whole seconds remain, rounding up and never less than 1', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(1, 60_000, c.now);
    limiter.hit('a');

    c.advance(36_500);
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 24 });

    c.advance(23_000); // 59.5 s in: half a second left still reads as 1
    expect(limiter.hit('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('opens a fresh window once the old one ends', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(1, 60_000, c.now);
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);

    c.advance(60_000);
    expect(limiter.hit('a')).toEqual({ allowed: true, remaining: 0 });
  });

  it('keeps a separate budget per address', () => {
    const limiter = new FixedWindowLimiter(1, 60_000, clock().now);
    limiter.hit('a');

    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('refused requests do not extend the wait', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(1, 60_000, c.now);
    limiter.hit('a');
    for (let i = 0; i < 50; i++) limiter.hit('a');

    c.advance(60_000);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('forgets finished windows so memory does not grow forever', () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(5, 60_000, c.now);
    for (let i = 0; i < 1000; i++) limiter.hit(`10.0.${Math.floor(i / 256)}.${i % 256}`);
    expect(limiter.size).toBe(1000);

    c.advance(60_000);
    limiter.hit('fresh');
    expect(limiter.size).toBe(1);
  });
});

describe('createRateLimiter', () => {
  const from = (xff: string) =>
    new Request('http://localhost/api/v1/restaurants', { headers: { 'x-forwarded-for': xff } });

  it('lets requests through until the limit, then answers 429 with Retry-After', async () => {
    const c = clock();
    const gate = createRateLimiter({ limit: 2, windowSeconds: 60, trustedProxies: 1 }, c.now);

    expect(gate(from('203.0.113.7'))).toBeUndefined();
    expect(gate(from('203.0.113.7'))).toBeUndefined();
    c.advance(15_000);
    const refused = gate(from('203.0.113.7'));

    expect(refused?.status).toBe(429);
    expect(refused?.headers.get('retry-after')).toBe('45');
    expect(await refused?.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests; try again in 45 seconds' },
    });
  });

  it('cannot be dodged by changing the part of the header the client controls', () => {
    const gate = createRateLimiter({ limit: 1, windowSeconds: 60, trustedProxies: 1 }, clock().now);

    expect(gate(from('forged-1, 203.0.113.7'))).toBeUndefined();
    expect(gate(from('forged-2, 203.0.113.7'))?.status).toBe(429);
    expect(gate(from('forged-3, 203.0.113.7'))?.status).toBe(429);
  });

  it('uses the numbers from the config file', () => {
    expect(rateLimitConfig).toEqual({ limit: 100, windowSeconds: 60, trustedProxies: 1 });
  });
});
