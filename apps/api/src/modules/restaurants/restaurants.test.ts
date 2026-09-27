import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toRestaurantPage, toRestaurantView } from './restaurants';

const row = {
  id: 'clx8k2j9d0000qz8h3v1f7a2b',
  name: 'Mama Put',
  area: 'Yaba',
  cuisine: 'Nigerian',
  rating: new Prisma.Decimal('4.3'),
  deliveryFee: 150000,
};

describe('toRestaurantView', () => {
  it('returns the public fields with rating as a number and deliveryFee in kobo', () => {
    expect(toRestaurantView(row)).toEqual({
      id: 'clx8k2j9d0000qz8h3v1f7a2b',
      name: 'Mama Put',
      area: 'Yaba',
      cuisine: 'Nigerian',
      rating: 4.3,
      deliveryFee: 150000,
    });
  });

  it('keeps a missing rating as null instead of inventing one', () => {
    expect(toRestaurantView({ ...row, rating: null }).rating).toBeNull();
  });

  it('keeps free delivery as 0', () => {
    expect(toRestaurantView({ ...row, deliveryFee: 0 }).deliveryFee).toBe(0);
  });
});

describe('toRestaurantPage', () => {
  const rows = ['a', 'b', 'c'].map((suffix) => ({
    ...row,
    id: `clx8k2j9d0000qz8h3v1f7a2${suffix}`,
  }));

  it('drops the extra row and points the cursor at the last row kept', () => {
    const page = toRestaurantPage(rows, 2);

    expect(page.items.map((r) => r.id)).toEqual([rows[0]?.id, rows[1]?.id]);
    expect(page.nextCursor).toBe(rows[1]?.id);
  });

  it('returns a null cursor on the last page', () => {
    const page = toRestaurantPage(rows, 3);

    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('returns an empty page with a null cursor when nothing is left', () => {
    expect(toRestaurantPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
