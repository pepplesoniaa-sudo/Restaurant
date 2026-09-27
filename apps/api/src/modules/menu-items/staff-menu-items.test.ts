import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuItem = {
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
};
vi.mock('@/lib/db', () => ({ db: { menuItem } }));

const { createMenuItem, listStaffMenuItems, updateMenuItem } = await import('./staff-menu-items');

const staff = { restaurantId: 'clrest000000000000000000a' };
const menuItemId = 'clitem00000000000000jollof';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listStaffMenuItems', () => {
  it('lists only this restaurant, hidden items included', async () => {
    menuItem.findMany.mockResolvedValue([]);

    await listStaffMenuItems(staff);

    const args = menuItem.findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual({ restaurantId: staff.restaurantId });
    expect(args.select.available).toBe(true);
  });
});

describe('createMenuItem', () => {
  it("files the item under the staff member's restaurant and starts it available", async () => {
    menuItem.create.mockResolvedValue({});

    await createMenuItem(staff, { name: 'Jollof rice', category: 'Mains', price: 350000 });

    expect(menuItem.create.mock.calls[0]?.[0].data).toEqual({
      name: 'Jollof rice',
      category: 'Mains',
      price: 350000,
      restaurantId: staff.restaurantId,
      available: true,
    });
  });

  it("can't be pointed at another restaurant, whatever the input carries", async () => {
    menuItem.create.mockResolvedValue({});
    const sneaky = {
      name: 'X',
      category: 'Y',
      price: 100,
      restaurantId: 'clrest000000000000000000b',
      available: false,
    };

    await createMenuItem(staff, sneaky);

    const data = menuItem.create.mock.calls[0]?.[0].data;
    expect(data.restaurantId).toBe(staff.restaurantId);
    expect(data.available).toBe(true);
  });
});

describe('updateMenuItem', () => {
  it('only updates an item of this restaurant', async () => {
    menuItem.updateMany.mockResolvedValue({ count: 1 });
    menuItem.findUniqueOrThrow.mockResolvedValue({});

    await updateMenuItem(staff, menuItemId, { available: false });

    expect(menuItem.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: menuItemId, restaurantId: staff.restaurantId },
      data: { available: false },
    });
  });

  it("returns null for another restaurant's item", async () => {
    menuItem.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateMenuItem(staff, menuItemId, { price: 400000 })).toBeNull();
    expect(menuItem.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
