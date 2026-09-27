import { describe, expect, it } from 'vitest';
import { pageArgs, toPage } from './pagination';

const rows = ['a', 'b', 'c'].map((suffix) => ({ id: `clx8k2j9d0000qz8h3v1f7a2${suffix}` }));
const toView = (row: { id: string }) => ({ viewOf: row.id });

describe('pageArgs', () => {
  it('fetches one extra row to see whether another page exists', () => {
    expect(pageArgs({ limit: 20 })).toEqual({ take: 21 });
  });

  it('starts after the cursor row', () => {
    expect(pageArgs({ limit: 20, cursor: 'clx8k2j9d0000qz8h3v1f7a2a' })).toEqual({
      take: 21,
      cursor: { id: 'clx8k2j9d0000qz8h3v1f7a2a' },
      skip: 1,
    });
  });
});

describe('toPage', () => {
  it('drops the extra row and points the cursor at the last row kept', () => {
    expect(toPage(rows, 2, toView)).toEqual({
      items: [{ viewOf: rows[0]?.id }, { viewOf: rows[1]?.id }],
      nextCursor: rows[1]?.id,
    });
  });

  it('returns a null cursor on the last page', () => {
    const page = toPage(rows, 3, toView);

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page with a null cursor when nothing is left', () => {
    expect(toPage([], 20, toView)).toEqual({ items: [], nextCursor: null });
  });
});
