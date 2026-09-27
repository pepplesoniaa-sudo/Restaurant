import type { Prisma } from '@prisma/client';
import type { RestaurantListQuery, RestaurantPage, RestaurantView } from '@restaurant/contracts';
import { db } from '@/lib/db';
import { pageArgs, toPage } from '@/lib/pagination';

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

export async function listRestaurants(query: RestaurantListQuery): Promise<RestaurantPage> {
  const rows = await db.restaurant.findMany({
    select: restaurantSelect,
    // id breaks ties between equal names, so every row has one fixed place in the order.
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    ...pageArgs(query),
  });
  return toPage(rows, query.limit, toRestaurantView);
}

export async function getRestaurant(restaurantId: string): Promise<RestaurantView | null> {
  const row = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: restaurantSelect,
  });
  return row === null ? null : toRestaurantView(row);
}
