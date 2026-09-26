import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ db: { restaurant: { findUnique } } }));

const { listAvailableMenuItems } = await import('./menu-items');

const restaurantId = 'clx8k2j9d0000qz8h3v1f7a2b';

describe('listAvailableMenuItems', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('only asks the database for available items', async () => {
    findUnique.mockResolvedValue({ menuItems: [] });

    await listAvailableMenuItems(restaurantId);

    const query = findUnique.mock.calls[0]?.[0];
    expect(query.where).toEqual({ id: restaurantId });
    expect(query.select.menuItems.where).toEqual({ available: true });
  });

  it('never selects the availability flag or the restaurant link', async () => {
    findUnique.mockResolvedValue({ menuItems: [] });

    await listAvailableMenuItems(restaurantId);

    const select = findUnique.mock.calls[0]?.[0].select.menuItems.select;
    expect(Object.keys(select).sort()).toEqual(['category', 'id', 'name', 'price']);
  });

  it('returns the items shaped for customers', async () => {
    findUnique.mockResolvedValue({
      menuItems: [
        { id: 'clx8k2j9d0001qz8h3v1f7a2c', name: 'Jollof rice', category: 'Mains', price: 350000 },
      ],
    });

    expect(await listAvailableMenuItems(restaurantId)).toEqual([
      { id: 'clx8k2j9d0001qz8h3v1f7a2c', name: 'Jollof rice', category: 'Mains', price: 350000 },
    ]);
  });

  it('returns an empty list for a restaurant with nothing available', async () => {
    findUnique.mockResolvedValue({ menuItems: [] });

    expect(await listAvailableMenuItems(restaurantId)).toEqual([]);
  });

  it('returns null when the restaurant does not exist', async () => {
    findUnique.mockResolvedValue(null);

    expect(await listAvailableMenuItems(restaurantId)).toBeNull();
  });
});
