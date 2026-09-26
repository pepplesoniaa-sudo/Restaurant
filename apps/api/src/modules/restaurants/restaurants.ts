import type { Prisma } from '@prisma/client';
import type { RestaurantView } from '@restaurant/contracts';
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

export async function listRestaurants(): Promise<RestaurantView[]> {
  const rows = await db.restaurant.findMany({
    select: restaurantSelect,
    orderBy: { name: 'asc' },
  });
  return rows.map(toRestaurantView);
}

export async function getRestaurant(restaurantId: string): Promise<RestaurantView | null> {
  const row = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: restaurantSelect,
  });
  return row === null ? null : toRestaurantView(row);
}
