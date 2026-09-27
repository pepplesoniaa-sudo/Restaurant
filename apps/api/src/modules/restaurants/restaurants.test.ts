import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { RestaurantListQuery } from '@restaurant/contracts';
import { restaurantOrderBy, restaurantWhere, toRestaurantView } from './restaurants';

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

const query = (params: Record<string, string> = {}) => RestaurantListQuery.parse(params);

describe('restaurantWhere', () => {
  it('matches everything with no filters', () => {
    expect(restaurantWhere(query())).toEqual({});
  });

  it('filters area and cuisine exactly but ignoring case', () => {
    expect(restaurantWhere(query({ area: 'yaba', cuisine: 'GRILLS' }))).toEqual({
      area: { equals: 'yaba', mode: 'insensitive' },
      cuisine: { equals: 'GRILLS', mode: 'insensitive' },
    });
  });

  it('filters by minimum rating and maximum delivery fee in kobo', () => {
    expect(restaurantWhere(query({ minRating: '4.5', maxDeliveryFee: '100000' }))).toEqual({
      rating: { gte: 4.5 },
      deliveryFee: { lte: 100000 },
    });
  });
});

describe('restaurantOrderBy', () => {
  it('defaults to name A–Z with id breaking ties', () => {
    expect(restaurantOrderBy(query())).toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  it('always puts restaurants with no rating last', () => {
    expect(restaurantOrderBy(query({ sort: 'rating', order: 'desc' }))[0]).toEqual({
      rating: { sort: 'desc', nulls: 'last' },
    });
    expect(restaurantOrderBy(query({ sort: 'rating', order: 'asc' }))[0]).toEqual({
      rating: { sort: 'asc', nulls: 'last' },
    });
  });

  it('sorts by delivery fee', () => {
    expect(restaurantOrderBy(query({ sort: 'deliveryFee', order: 'desc' }))).toEqual([
      { deliveryFee: 'desc' },
      { id: 'asc' },
    ]);
  });
});
