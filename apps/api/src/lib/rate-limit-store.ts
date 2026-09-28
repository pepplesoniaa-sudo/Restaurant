import { db } from './db';
import type { RateLimitStore, WindowCount } from './rate-limit';

// Rate-limit counts in PostgreSQL (README, Rate limiting; table RateLimitWindow), shared by every
// server process. Each count is one atomic UPDATE: Postgres locks the row, so simultaneous requests
// from one address are counted one after another and none can slip past the limit.
//
// Times are computed inside Postgres, in UTC like every Prisma DateTime column, so neither the
// database's own timezone nor the clocks of different app servers matter.

type Row = { count: number; retryAfterMs: number };

/** Counts one request, starting a fresh window if the last one has ended. `[]` if no row yet. */
function countRequest(key: string, windowSeconds: number): Promise<Row[]> {
  return db.$queryRaw<Row[]>`
    UPDATE "RateLimitWindow"
    SET
      "count" = CASE
        WHEN "windowStart" <= (now() AT TIME ZONE 'UTC') - ${windowSeconds}::int * interval '1 second'
        THEN 1 ELSE "count" + 1 END,
      "windowStart" = CASE
        WHEN "windowStart" <= (now() AT TIME ZONE 'UTC') - ${windowSeconds}::int * interval '1 second'
        THEN (now() AT TIME ZONE 'UTC') ELSE "windowStart" END
    WHERE "key" = ${key}
    RETURNING
      "count",
      (EXTRACT(EPOCH FROM
        "windowStart" + ${windowSeconds}::int * interval '1 second' - (now() AT TIME ZONE 'UTC')
      ) * 1000)::float8 AS "retryAfterMs"`;
}

async function hit(key: string, windowSeconds: number): Promise<WindowCount> {
  const [counted] = await countRequest(key, windowSeconds);
  if (counted !== undefined) return counted;

  // First request from this address. Prisma creates the row (and its cuid) with a window that has
  // already ended, so the UPDATE above opens a fresh one. skipDuplicates makes this safe when two
  // first requests arrive together.
  await db.rateLimitWindow.createMany({
    data: [{ key, windowStart: new Date(0), count: 0 }],
    skipDuplicates: true,
  });
  const [first] = await countRequest(key, windowSeconds);
  if (first === undefined) throw new Error('rate-limit row vanished between insert and update');
  return first;
}

let lastSweep = 0;

/** Deletes finished windows, at most once per window length in this process. */
async function sweep(windowSeconds: number): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < windowSeconds * 1000) return;
  lastSweep = now;
  await db.$executeRaw`
    DELETE FROM "RateLimitWindow"
    WHERE "windowStart" <= (now() AT TIME ZONE 'UTC') - ${windowSeconds}::int * interval '1 second'`;
}

export const postgresRateLimitStore: RateLimitStore = {
  async hit(key, windowSeconds) {
    await sweep(windowSeconds);
    return hit(key, windowSeconds);
  },
};
