import type { Prisma } from '@prisma/client';
import type { ListEnvelope, RestaurantListQuery, RestaurantView } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { pageArgs, toList } from '@/lib/pagination';

// Restaurants hold no personal data, so they are public to read (README, Access).

const restaurantSelect = {
  id: true,
  name: true,
  area: true,
  cuisine: true,
  rating: true,
  deliveryFee: true,
} satisfies Prisma.RestaurantSelect;

type RestaurantRow = Prisma.RestaurantGetPayload<{ select: typeof restaurantSelect }>;

export function toRestaurantView(row: RestaurantRow): RestaurantView {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    cuisine: row.cuisine,
    // rating is a star score, not money, so a JSON number is safe here.
    rating: row.rating === null ? null : row.rating.toNumber(),
    deliveryFee: row.deliveryFee,
  };
}

export function restaurantWhere(query: RestaurantListQuery): Prisma.RestaurantWhereInput {
  return {
    ...(query.area === undefined ? {} : { area: { equals: query.area, mode: 'insensitive' } }),
    ...(query.cuisine === undefined
      ? {}
      : { cuisine: { equals: query.cuisine, mode: 'insensitive' } }),
    ...(query.minRating === undefined ? {} : { rating: { gte: query.minRating } }),
    ...(query.maxDeliveryFee === undefined ? {} : { deliveryFee: { lte: query.maxDeliveryFee } }),
  };
}

export function restaurantOrderBy(
  query: RestaurantListQuery,
): Prisma.RestaurantOrderByWithRelationInput[] {
  const first: Prisma.RestaurantOrderByWithRelationInput =
    query.sort === 'rating'
      ? // "No rating yet" is not a low score, so it always goes last.
        { rating: { sort: query.order, nulls: 'last' } }
      : { [query.sort]: query.order };
  // id breaks ties, so every row has one fixed place and pages don't overlap.
  return [first, { id: 'asc' }];
}

export async function listRestaurants(
  query: RestaurantListQuery,
): Promise<ListEnvelope<RestaurantView>> {
  const where = restaurantWhere(query);
  const [total, rows] = await db.$transaction([
    db.restaurant.count({ where }),
    db.restaurant.findMany({
      where,
      select: restaurantSelect,
      orderBy: restaurantOrderBy(query),
      ...pageArgs(query),
    }),
  ]);
  return toList(rows, total, query, toRestaurantView);
}

export async function getRestaurant(restaurantId: string): Promise<RestaurantView | null> {
  const row = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: restaurantSelect,
  });
  return row === null ? null : toRestaurantView(row);
}
