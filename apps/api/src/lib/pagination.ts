import type { ListEnvelope } from '@restaurant/contracts';

// Offset pagination shared by every list (README, Lists: pagination, filtering and sorting).

export type PageQuery = { limit: number; offset: number };

/** Prisma `skip`/`take` for one page. */
export function pageArgs(query: PageQuery): { skip: number; take: number } {
  return { skip: query.offset, take: query.limit };
}

/** Wraps one page of rows, and the count of every matching row, in the list envelope. */
export function toList<Row, View>(
  rows: Row[],
  total: number,
  query: PageQuery,
  toView: (row: Row) => View,
): ListEnvelope<View> {
  return {
    data: rows.map(toView),
    meta: {
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + rows.length < total,
    },
  };
}
