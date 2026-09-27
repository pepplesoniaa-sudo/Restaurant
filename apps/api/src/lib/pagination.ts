import type { Page } from '@restaurant/contracts';

/** Prisma arguments for one cursor page: one extra row is fetched to learn if another page exists. */
export function pageArgs(query: { limit: number; cursor?: string | undefined }) {
  return {
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  };
}

/**
 * `rows` is one longer than `limit` when another page exists: the extra row is dropped and the
 * last kept row's id becomes the next cursor.
 */
export function toPage<Row extends { id: string }, View>(
  rows: Row[],
  limit: number,
  toView: (row: Row) => View,
): Page<View> {
  const kept = rows.slice(0, limit);
  const last = kept.at(-1);
  return {
    items: kept.map(toView),
    nextCursor: rows.length > limit && last !== undefined ? last.id : null,
  };
}
