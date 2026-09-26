import type { Prisma } from '@prisma/client';
import type { MenuItemView } from '@restaurant/contracts';
import { db } from '@/lib/db';

const menuItemSelect = {
  id: true,
  name: true,
  category: true,
  price: true,
} satisfies Prisma.MenuItemSelect;

type MenuItemRow = Prisma.MenuItemGetPayload<{ select: typeof menuItemSelect }>;

export function toMenuItemView(row: MenuItemRow): MenuItemView {
  return { id: row.id, name: row.name, category: row.category, price: row.price };
}

/**
 * The menu a customer sees. Items with `available = false` are hidden, not deleted
 * (README, Rules the data must keep), so they never appear here.
 *
 * Returns `null` when the restaurant doesn't exist, so the caller can tell that apart from a
 * restaurant with nothing on its menu right now.
 */
export async function listAvailableMenuItems(restaurantId: string): Promise<MenuItemView[] | null> {
  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      menuItems: {
        where: { available: true },
        select: menuItemSelect,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      },
    },
  });
  return restaurant === null ? null : restaurant.menuItems.map(toMenuItemView);
}
