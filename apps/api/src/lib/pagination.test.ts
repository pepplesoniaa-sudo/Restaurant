import { describe, expect, it } from 'vitest';
import { pageArgs, toList } from './pagination';

const toView = (row: number) => ({ n: row });

describe('pageArgs', () => {
  it('skips the offset and takes the limit', () => {
    expect(pageArgs({ limit: 20, offset: 40 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('toList', () => {
  it('reports more pages while rows remain past this one', () => {
    expect(toList([1, 2], 5, { limit: 2, offset: 0 }, toView)).toEqual({
      data: [{ n: 1 }, { n: 2 }],
      meta: { total: 5, limit: 2, offset: 0, hasMore: true },
    });
  });

  it('reports no more pages on the last, partly filled page', () => {
    expect(toList([5], 5, { limit: 2, offset: 4 }, toView).meta.hasMore).toBe(false);
  });

  it('reports no more pages when the last page is exactly full', () => {
    expect(toList([3, 4], 4, { limit: 2, offset: 2 }, toView).meta.hasMore).toBe(false);
  });

  it('returns an empty page past the end', () => {
    expect(toList([], 4, { limit: 20, offset: 100 }, toView)).toEqual({
      data: [],
      meta: { total: 4, limit: 20, offset: 100, hasMore: false },
    });
  });
});
