import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  rateLimitWindow: { createMany: vi.fn() },
};
vi.mock('./db', () => ({ db }));

const { postgresRateLimitStore } = await import('./rate-limit-store');

// The SQL itself is checked against a real database in the end-to-end run; these tests pin down
// the order of operations around it.

beforeEach(() => {
  vi.clearAllMocks();
  db.$executeRaw.mockResolvedValue(0);
});

describe('postgresRateLimitStore.hit', () => {
  it('counts an address it already knows with a single UPDATE', async () => {
    db.$queryRaw.mockResolvedValue([{ count: 7, retryAfterMs: 30_000 }]);

    expect(await postgresRateLimitStore.hit('203.0.113.7', 60)).toEqual({
      count: 7,
      retryAfterMs: 30_000,
    });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.rateLimitWindow.createMany).not.toHaveBeenCalled();
  });

  it('creates the row for a new address through Prisma, then counts it', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 1, retryAfterMs: 60_000 }]);

    expect(await postgresRateLimitStore.hit('198.51.100.9', 60)).toEqual({
      count: 1,
      retryAfterMs: 60_000,
    });
    expect(db.rateLimitWindow.createMany).toHaveBeenCalledExactlyOnceWith({
      // Created with a window that has already ended, so the UPDATE opens a fresh one.
      data: [{ key: '198.51.100.9', windowStart: new Date(0), count: 0 }],
      skipDuplicates: true,
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('passes the address and window length as query parameters, never spliced into SQL', async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1, retryAfterMs: 60_000 }]);

    await postgresRateLimitStore.hit('1.1.1.1\'; DROP TABLE "Order";--', 60);

    const [strings, ...values] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('')).not.toContain('DROP TABLE');
    expect(values).toContain('1.1.1.1\'; DROP TABLE "Order";--');
  });

  it('fails loudly if the row disappears between insert and update', async () => {
    db.$queryRaw.mockResolvedValue([]);

    await expect(postgresRateLimitStore.hit('203.0.113.7', 60)).rejects.toThrow(/vanished/);
  });
});
