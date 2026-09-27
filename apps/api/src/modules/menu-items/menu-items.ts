import type { Prisma } from '@prisma/client';
import type {
  ListEnvelope,
  MenuItemCreateInput,
  MenuItemUpdateInput,
  MenuItemView,
  MenuListQuery,
} from '@restaurant/contracts';
import { db } from '@/lib/db';
import { pageArgs, toList } from '@/lib/pagination';
import type { Staff } from '@/modules/restaurants/staff-auth';

// Menus are public, except hidden items (`available = false`), which only the restaurant's own
// staff see (README, Access). Items are never deleted: hiding one is how it leaves the menu
// (rule D). Changing a price never touches past orders, because each order line keeps its own
// unitPrice.

const menuItemSelect = {
  id: true,
  restaurantId: true,
  name: true,
  category: true,
  price: true,
  available: true,
} satisfies Prisma.MenuItemSelect;

/** Anyone calling without a staff key is `null`. */
export type Viewer = Staff | null;

export function seesHidden(viewer: Viewer, restaurantId: string): boolean {
  return viewer !== null && viewer.restaurantId === restaurantId;
}

export function menuWhere(
  restaurantId: string,
  query: MenuListQuery,
  hiddenVisible: boolean,
): Prisma.MenuItemWhereInput {
  return {
    restaurantId,
    AND: [
      // Rule C: for customers, hidden items don't exist.
      hiddenVisible ? {} : { available: true },
      query.available === undefined ? {} : { available: query.available },
    ],
    ...(query.category === undefined
      ? {}
      : { category: { equals: query.category, mode: 'insensitive' } }),
    ...(query.minPrice === undefined && query.maxPrice === undefined
      ? {}
      : {
          price: {
            ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
            ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
          },
        }),
  };
}

export function menuOrderBy(query: MenuListQuery): Prisma.MenuItemOrderByWithRelationInput[] {
  // Within a category, dishes read alphabetically; id breaks any remaining tie.
  const then: Prisma.MenuItemOrderByWithRelationInput[] =
    query.sort === 'category' ? [{ name: 'asc' }, { id: 'asc' }] : [{ id: 'asc' }];
  return [{ [query.sort]: query.order }, ...then];
}

/** `null` when the restaurant doesn't exist. */
export async function listMenu(
  restaurantId: string,
  query: MenuListQuery,
  viewer: Viewer,
): Promise<ListEnvelope<MenuItemView> | null> {
  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true },
  });
  if (restaurant === null) return null;

  const where = menuWhere(restaurantId, query, seesHidden(viewer, restaurantId));
  const [total, rows] = await db.$transaction([
    db.menuItem.count({ where }),
    db.menuItem.findMany({
      where,
      select: menuItemSelect,
      orderBy: menuOrderBy(query),
      ...pageArgs(query),
    }),
  ]);
  return toList(rows, total, query, (row) => row);
}

/** `null` when the item doesn't exist or is hidden from this viewer. */
export async function getMenuItem(
  menuItemId: string,
  viewer: Viewer,
): Promise<MenuItemView | null> {
  const item = await db.menuItem.findUnique({ where: { id: menuItemId }, select: menuItemSelect });
  if (item === null) return null;
  return item.available || seesHidden(viewer, item.restaurantId) ? item : null;
}

export type CreateMenuItemResult =
  { ok: true; item: MenuItemView } | { ok: false; reason: 'FORBIDDEN' };

export async function createMenuItem(
  staff: Staff,
  restaurantId: string,
  input: MenuItemCreateInput,
): Promise<CreateMenuItemResult> {
  if (staff.restaurantId !== restaurantId) return { ok: false, reason: 'FORBIDDEN' };
  const item = await db.menuItem.create({
    // A new item always starts available.
    data: { ...input, restaurantId: staff.restaurantId, available: true },
    select: menuItemSelect,
  });
  return { ok: true, item };
}

/** `null` when the item doesn't exist or belongs to another restaurant. */
export async function updateMenuItem(
  staff: Staff,
  menuItemId: string,
  input: MenuItemUpdateInput,
): Promise<MenuItemView | null> {
  const updated = await db.menuItem.updateMany({
    where: { id: menuItemId, restaurantId: staff.restaurantId },
    data: input,
  });
  if (updated.count === 0) return null;
  return db.menuItem.findUniqueOrThrow({ where: { id: menuItemId }, select: menuItemSelect });
}
