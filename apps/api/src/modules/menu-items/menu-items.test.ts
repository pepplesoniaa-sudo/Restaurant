import { MenuListQuery } from '@restaurant/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuItem = {
  count: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
};
const restaurant = { findUnique: vi.fn() };
vi.mock('@/lib/db', () => ({
  db: {
    menuItem,
    restaurant,
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  },
}));

const { createMenuItem, getMenuItem, listMenu, menuOrderBy, menuWhere, updateMenuItem } =
  await import('./menu-items');

const restaurantId = 'clrest000000000000000000a';
const staff = { restaurantId };
const otherStaff = { restaurantId: 'clrest000000000000000000b' };
const menuItemId = 'clitem00000000000000jollof';
const query = (params: Record<string, string> = {}) => MenuListQuery.parse(params);
const item = (available: boolean) => ({
  id: menuItemId,
  restaurantId,
  name: 'Jollof rice',
  category: 'Mains',
  price: 350000,
  available,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('menuWhere', () => {
  it('hides unavailable items from everyone but the restaurant’s staff (rule C)', () => {
    expect(menuWhere(restaurantId, query(), false)).toEqual({
      restaurantId,
      AND: [{ available: true }, {}],
    });
    expect(menuWhere(restaurantId, query(), true)).toEqual({ restaurantId, AND: [{}, {}] });
  });

  it('lets staff filter to hidden items only', () => {
    expect(menuWhere(restaurantId, query({ available: 'false' }), true).AND).toEqual([
      {},
      { available: false },
    ]);
  });

  it('can never show a hidden item to a customer, even when asked for one', () => {
    // Both conditions apply together, so this matches nothing.
    expect(menuWhere(restaurantId, query({ available: 'false' }), false).AND).toEqual([
      { available: true },
      { available: false },
    ]);
  });

  it('filters by category, ignoring case, and by a price range in kobo', () => {
    expect(
      menuWhere(
        restaurantId,
        query({ category: 'mains', minPrice: '1000', maxPrice: '5000' }),
        false,
      ),
    ).toMatchObject({
      category: { equals: 'mains', mode: 'insensitive' },
      price: { gte: 1000, lte: 5000 },
    });
  });

  it('supports a one-sided price range', () => {
    expect(menuWhere(restaurantId, query({ maxPrice: '5000' }), false).price).toEqual({
      lte: 5000,
    });
  });
});

describe('menuOrderBy', () => {
  it('defaults to category, then name, then id', () => {
    expect(menuOrderBy(query())).toEqual([{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }]);
  });

  it('sorts by price with id breaking ties', () => {
    expect(menuOrderBy(query({ sort: 'price', order: 'desc' }))).toEqual([
      { price: 'desc' },
      { id: 'asc' },
    ]);
  });
});

describe('listMenu', () => {
  it('returns null when the restaurant does not exist', async () => {
    restaurant.findUnique.mockResolvedValue(null);

    expect(await listMenu(restaurantId, query(), null)).toBeNull();
    expect(menuItem.findMany).not.toHaveBeenCalled();
  });

  it('returns a page with the total count', async () => {
    restaurant.findUnique.mockResolvedValue({ id: restaurantId });
    menuItem.count.mockResolvedValue(3);
    menuItem.findMany.mockResolvedValue([item(true)]);

    expect(await listMenu(restaurantId, query({ limit: '1', offset: '1' }), null)).toEqual({
      data: [item(true)],
      meta: { total: 3, limit: 1, offset: 1, hasMore: true },
    });
    expect(menuItem.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 1, take: 1 });
  });

  it("shows another restaurant's staff only what customers see", async () => {
    restaurant.findUnique.mockResolvedValue({ id: restaurantId });
    menuItem.count.mockResolvedValue(0);
    menuItem.findMany.mockResolvedValue([]);

    await listMenu(restaurantId, query(), otherStaff);

    expect(menuItem.findMany.mock.calls[0]?.[0].where.AND[0]).toEqual({ available: true });
  });
});

describe('getMenuItem', () => {
  it('shows an available item to anyone', async () => {
    menuItem.findUnique.mockResolvedValue(item(true));

    expect(await getMenuItem(menuItemId, null)).toEqual(item(true));
  });

  it("shows a hidden item only to its own restaurant's staff", async () => {
    menuItem.findUnique.mockResolvedValue(item(false));

    expect(await getMenuItem(menuItemId, null)).toBeNull();
    expect(await getMenuItem(menuItemId, otherStaff)).toBeNull();
    expect(await getMenuItem(menuItemId, staff)).toEqual(item(false));
  });
});

describe('createMenuItem', () => {
  const input = { name: 'Jollof rice', category: 'Mains', price: 350000 };

  it("refuses to add to another restaurant's menu", async () => {
    expect(await createMenuItem(otherStaff, restaurantId, input)).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(menuItem.create).not.toHaveBeenCalled();
  });

  it('files the item under the staff member’s restaurant and starts it available', async () => {
    menuItem.create.mockResolvedValue(item(true));
    const sneaky = { ...input, restaurantId: 'clrest000000000000000000b', available: false };

    await createMenuItem(staff, restaurantId, sneaky);

    expect(menuItem.create.mock.calls[0]?.[0].data).toEqual({
      ...input,
      restaurantId,
      available: true,
    });
  });
});

describe('updateMenuItem', () => {
  it('only updates an item of the staff member’s restaurant', async () => {
    menuItem.updateMany.mockResolvedValue({ count: 1 });
    menuItem.findUniqueOrThrow.mockResolvedValue(item(false));

    await updateMenuItem(staff, menuItemId, { available: false });

    expect(menuItem.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: menuItemId, restaurantId },
      data: { available: false },
    });
  });

  it("returns null for another restaurant's item", async () => {
    menuItem.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateMenuItem(otherStaff, menuItemId, { price: 400000 })).toBeNull();
  });
});
