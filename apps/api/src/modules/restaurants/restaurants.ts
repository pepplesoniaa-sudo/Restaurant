import type { Prisma } from '@prisma/client';
import type { RestaurantListQuery, RestaurantPage, RestaurantView } from '@restaurant/contracts';
import { db } from '@/lib/db';

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

/**
 * `rows` is one longer than `limit` when another page exists: the extra row is dropped and the
 * last kept row's id becomes the next cursor.
 */
export function toRestaurantPage(rows: RestaurantRow[], limit: number): RestaurantPage {
  const items = rows.slice(0, limit).map(toRestaurantView);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last !== undefined ? last.id : null };
}

export async function listRestaurants(query: RestaurantListQuery): Promise<RestaurantPage> {
  const rows = await db.restaurant.findMany({
    select: restaurantSelect,
    // id breaks ties between equal names, so every row has one fixed place in the order.
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  });
  return toRestaurantPage(rows, query.limit);
}

export async function getRestaurant(restaurantId: string): Promise<RestaurantView | null> {
  const row = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: restaurantSelect,
  });
  return row === null ? null : toRestaurantView(row);
}
