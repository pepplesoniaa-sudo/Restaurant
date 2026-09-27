import type { Prisma } from '@prisma/client';
import type {
  MenuItemCreateInput,
  MenuItemUpdateInput,
  StaffMenuItemView,
} from '@restaurant/contracts';
import { db } from '@/lib/db';
import type { Staff } from '@/modules/restaurants/staff-auth';

// A restaurant's own menu, as its staff manage it (README, Restaurant staff access). Items are
// never deleted: hiding one is `available = false` (rule D). Changing a price never touches past
// orders, because each order line keeps its own unitPrice.

const staffMenuItemSelect = {
  id: true,
  name: true,
  category: true,
  price: true,
  available: true,
} satisfies Prisma.MenuItemSelect;

export async function listStaffMenuItems(staff: Staff): Promise<StaffMenuItemView[]> {
  return db.menuItem.findMany({
    where: { restaurantId: staff.restaurantId },
    select: staffMenuItemSelect,
    orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
  });
}

export async function createMenuItem(
  staff: Staff,
  input: MenuItemCreateInput,
): Promise<StaffMenuItemView> {
  return db.menuItem.create({
    // The restaurant comes from the staff key; a new item always starts available.
    data: { ...input, restaurantId: staff.restaurantId, available: true },
    select: staffMenuItemSelect,
  });
}

/** `null` when the item doesn't exist or belongs to another restaurant. */
export async function updateMenuItem(
  staff: Staff,
  menuItemId: string,
  input: MenuItemUpdateInput,
): Promise<StaffMenuItemView | null> {
  const updated = await db.menuItem.updateMany({
    where: { id: menuItemId, restaurantId: staff.restaurantId },
    data: input,
  });
  if (updated.count === 0) return null;
  return db.menuItem.findUniqueOrThrow({ where: { id: menuItemId }, select: staffMenuItemSelect });
}
