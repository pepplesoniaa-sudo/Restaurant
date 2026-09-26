import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toRestaurantView } from './restaurants';

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
